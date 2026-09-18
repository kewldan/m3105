"use client";

import { PaperclipIcon, XIcon } from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { fileIcon } from "@/components/site/attachments/gallery";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/lib/api/types";
import {
  isImageType,
  type UploadTarget,
  uploadErrorMessage,
  uploadFile,
} from "@/lib/api/upload";
import { prepareForUpload } from "@/lib/files/prepare-image";
import { previewSrc } from "@/lib/files/preview";
import { fmtBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Что понимает сервер для студентов; HEIC браузер перекодирует в JPEG. */
export const STUDENT_ACCEPT = "image/*,.heic,.heif,application/pdf";

type Item = {
  key: string;
  name: string;
  size: number;
  contentType: string;
  /** Object URL локальной копии, пока файл грузится, потом — адрес на сервере. */
  preview: string | null;
  /** 0…1 во время загрузки, null — загружен. */
  progress: number | null;
  attachment: Attachment | null;
};

const fromAttachment = (a: Attachment): Item => ({
  key: a.id,
  name: a.name,
  size: a.size,
  contentType: a.contentType,
  preview: isImageType(a.contentType) ? previewSrc(a.url, 160) : null,
  progress: null,
  attachment: a,
});

let seq = 0;

/**
 * Files of a comment or post being written: uploads start as soon as a file is
 * picked, pasted or dropped, so sending the form only passes ready ids.
 */
export function useAttachments({
  target = "student",
  max = 6,
}: {
  target?: UploadTarget;
  max?: number;
} = {}) {
  const [items, setItems] = useState<Item[]>([]);
  // Незаконченные загрузки и локальные превью по ключу: их нужно отменить и
  // освободить при удалении, сбросе и уходе со страницы.
  const aborts = useRef(new Map<string, AbortController>());
  const previews = useRef(new Map<string, string>());

  const release = (key: string) => {
    aborts.current.get(key)?.abort();
    aborts.current.delete(key);
    const url = previews.current.get(key);
    if (url) URL.revokeObjectURL(url);
    previews.current.delete(key);
  };

  useEffect(() => {
    const pending = aborts.current;
    const urls = previews.current;
    return () => {
      for (const a of pending.values()) a.abort();
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const patch = (key: string, next: Partial<Item>) =>
    setItems((list) =>
      list.map((it) => (it.key === key ? { ...it, ...next } : it)),
    );

  const drop = (key: string) => {
    release(key);
    setItems((list) => list.filter((x) => x.key !== key));
  };

  async function uploadOne(file: File) {
    const key = `local-${++seq}`;
    const abort = new AbortController();
    aborts.current.set(key, abort);
    const preview = isImageType(file.type) ? URL.createObjectURL(file) : null;
    if (preview) previews.current.set(key, preview);
    setItems((list) => [
      ...list,
      {
        key,
        name: file.name,
        size: file.size,
        contentType: file.type,
        preview,
        progress: 0,
        attachment: null,
      },
    ]);
    try {
      const prepared = await prepareForUpload(file);
      const attachment = await uploadFile(prepared, {
        target,
        signal: abort.signal,
        onProgress: (p) => patch(key, { progress: p }),
      });
      aborts.current.delete(key);
      patch(key, {
        attachment,
        progress: null,
        size: attachment.size,
        name: attachment.name,
        contentType: attachment.contentType,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(`${file.name}: ${uploadErrorMessage(err)}`);
      drop(key);
    }
  }

  const add = (files: Iterable<File>) => {
    const list = [...files];
    const room = max - items.length;
    if (list.length > room) {
      toast.error(
        room > 0
          ? `Можно прикрепить ещё ${room}, остальные пропущены`
          : `Не больше ${max} файлов`,
      );
    }
    for (const file of list.slice(0, Math.max(0, room))) void uploadOne(file);
  };

  /** Starts over, e.g. with the files of the post being edited. */
  const reset = (initial: Attachment[] = []) => {
    for (const key of [...aborts.current.keys(), ...previews.current.keys()])
      release(key);
    setItems(initial.map(fromAttachment));
  };

  /** Paste handler for a textarea: files from the clipboard, text as usual. */
  const onPaste = (e: ClipboardEvent) => {
    const pasted = [...e.clipboardData.files];
    if (pasted.length === 0) return;
    e.preventDefault();
    add(pasted);
  };

  return {
    items,
    add,
    remove: drop,
    reset,
    onPaste,
    ids: items.flatMap((it) => (it.attachment ? [it.attachment.id] : [])),
    uploading: items.some((it) => it.progress !== null),
    full: items.length >= max,
  };
}

export type AttachmentsState = ReturnType<typeof useAttachments>;

/** Props for a drop zone plus whether a file is being dragged over it. */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  return {
    dragging,
    dropProps: {
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setDragging(false);
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        onFiles([...e.dataTransfer.files]);
      },
    },
  };
}

/** Paperclip button with a hidden file input. */
export function AttachButton({
  state,
  accept,
  size = "sm",
  label = "Файл",
  className,
}: {
  state: AttachmentsState;
  /** Без значения — любые файлы (админка). */
  accept?: string;
  size?: "sm" | "default";
  label?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        hidden
        onChange={(e) => {
          if (e.target.files) state.add(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={state.full}
        onClick={() => input.current?.click()}
        aria-label={label ? undefined : "Прикрепить фото или файл"}
        title={state.full ? "Больше файлов не поместится" : undefined}
        className={cn("text-muted-foreground", className)}
      >
        <PaperclipIcon data-icon={label ? "inline-start" : undefined} />
        {label}
      </Button>
    </>
  );
}

/** Previews of the files being attached, with progress and a remove button. */
export function AttachmentTray({
  state,
  className,
}: {
  state: AttachmentsState;
  className?: string;
}) {
  if (state.items.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {state.items.map((it) => {
        const Icon = fileIcon(it.contentType);
        const pct = it.progress === null ? null : Math.round(it.progress * 100);
        return (
          <li
            key={it.key}
            className="group relative size-20 overflow-hidden rounded-lg border bg-muted/40"
            title={`${it.name} · ${fmtBytes(it.size)}`}
          >
            {it.preview ? (
              // biome-ignore lint/performance/noImgElement: local object URLs and API files, not Next images.
              <img
                src={it.preview}
                alt={it.name}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 p-1.5 text-center">
                <Icon className="size-5 text-muted-foreground" aria-hidden />
                <span className="line-clamp-2 text-[10px] leading-tight break-all text-muted-foreground">
                  {it.name}
                </span>
              </div>
            )}
            {pct !== null ? (
              <div className="absolute inset-0 flex items-end bg-background/55">
                <div
                  className="h-1 bg-primary transition-[width]"
                  style={{ width: `${Math.max(pct, 4)}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Загрузка ${it.name}`}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => state.remove(it.key)}
              aria-label={`Убрать ${it.name}`}
              className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-colors hover:bg-destructive hover:text-white"
            >
              <XIcon className="size-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
