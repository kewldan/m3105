"use client";

import { ApiError } from "./client";
import type { ApiErrorBody, Attachment } from "./types";

/**
 * Куда грузить: `student` — свои файлы для комментариев и постов, `admin` —
 * файлы для текстов (MDX), `adminSocial` — файлы админа для чужих
 * комментариев и постов при модерации.
 */
export type UploadTarget = "student" | "admin" | "adminSocial";

const ENDPOINT: Record<UploadTarget, string> = {
  student: "/api/v1/files",
  admin: "/api/v1/admin/files",
  adminSocial: "/api/v1/admin/files?scope=social",
};

/**
 * Uploads one file as multipart. XMLHttpRequest instead of fetch: fetch still
 * cannot report upload progress, and on a phone a 5 MB photo takes a while.
 */
export function uploadFile(
  file: Blob,
  opts: {
    target: UploadTarget;
    name?: string;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  },
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ENDPOINT[opts.target]);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as Attachment);
        return;
      }
      reject(new ApiError(xhr.status, body as ApiErrorBody | null));
    };
    xhr.onerror = () => reject(new Error("Нет связи с сервером"));
    xhr.onabort = () =>
      reject(new DOMException("Загрузка отменена", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const form = new FormData();
    const name =
      opts.name ?? (file instanceof File ? file.name : undefined) ?? "file";
    form.append("file", file, name);
    xhr.send(form);
  });
}

/** Сообщение об ошибке загрузки для тоста. */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Войдите, чтобы прикреплять файлы";
    return err.fields.file ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Не удалось загрузить файл";
}

export const isImageType = (contentType: string) =>
  contentType.startsWith("image/");
