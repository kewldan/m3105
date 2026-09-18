"use client";

import {
  CodeIcon,
  ExternalLinkIcon,
  HardDriveIcon,
  LinkIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AttachmentThumbs } from "@/components/admin/attachment-thumbs";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { AdminAttachment, AttachmentPlace } from "@/lib/api/types";
import { isImageType, uploadErrorMessage, uploadFile } from "@/lib/api/upload";
import { prepareForUpload } from "@/lib/files/prepare-image";
import { fmtBytes, fmtRelative } from "@/lib/format";

const PLACE: Record<AttachmentPlace, { label: string; hint: string }> = {
  content: { label: "Тексты", hint: "Загружено в админке" },
  comment: { label: "Комментарий", hint: "Прикреплено к комментарию" },
  post: { label: "Пост", hint: "Прикреплено к посту" },
  pending: {
    label: "Не отправлено",
    hint: "Студент загрузил, но не отправил — удалится через сутки",
  },
};

const REF_LABEL: Record<AdminAttachment["usedIn"][number]["type"], string> = {
  note: "Конспект",
  lab: "Лаба",
  page: "Страница",
  faq: "ЧаВо",
  subject: "Предмет",
};

const FILTERS = [
  { value: "all", label: "Все" },
  { value: "content", label: "Тексты" },
  { value: "social", label: "От студентов" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

/** Абсолютная ссылка, чтобы её можно было отправить куда угодно. */
const absolute = (url: string) =>
  typeof window === "undefined"
    ? url
    : new URL(url, window.location.origin).href;

const markdown = (a: AdminAttachment) => {
  const label = a.name.replace(/[[\]]/g, "");
  return isImageType(a.contentType)
    ? `![${label.replace(/\.[^.]+$/, "")}](${a.url})`
    : `[${label}](${a.url})`;
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} скопирована`);
  } catch {
    toast.error("Не удалось скопировать");
  }
}

export default function FilesPage() {
  const { data, loading, reload } = useQuery(() => adminApi.files.list());
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<AdminAttachment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [uploading, setUploading] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const rows = (data ?? []).filter((r) =>
    filter === "all"
      ? true
      : filter === "content"
        ? r.place === "content"
        : r.place !== "content",
  );
  const total = (data ?? []).reduce((sum, r) => sum + r.size, 0);

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setUploading((n) => n + files.length);
    const done = await Promise.all(
      files.map(async (file) => {
        try {
          await uploadFile(await prepareForUpload(file), { target: "admin" });
          return true;
        } catch (err) {
          toast.error(`${file.name}: ${uploadErrorMessage(err)}`);
          return false;
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    const ok = done.filter(Boolean).length;
    if (ok > 0) {
      toast.success(ok === 1 ? "Файл загружен" : `Загружено файлов: ${ok}`, {
        description: "Скопируйте разметку и вставьте в текст.",
      });
      reload();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.files.remove(deleting.id);
      toast.success("Файл удалён");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<AdminAttachment>[] = [
    {
      id: "file",
      header: "Файл",
      sort: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <AttachmentThumbs items={[r]} />
          <div className="min-w-0">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-72 truncate font-medium hover:underline"
            >
              {r.name}
            </a>
            <div className="text-xs text-muted-foreground">
              {fmtBytes(r.size)}
              {r.width && r.height ? ` · ${r.width}×${r.height}` : ""}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "place",
      header: "Где",
      sort: (r) => r.place,
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge
                  variant={r.place === "pending" ? "outline" : "secondary"}
                  className="w-fit"
                />
              }
            >
              {PLACE[r.place].label}
            </TooltipTrigger>
            <TooltipContent>{PLACE[r.place].hint}</TooltipContent>
          </Tooltip>
          {r.place === "content" ? (
            r.usedIn.length > 0 ? (
              r.usedIn.map((ref) => (
                <a
                  key={`${ref.type}:${ref.path}`}
                  href={ref.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-60 items-center gap-1 text-xs text-primary hover:underline"
                >
                  <span className="truncate">
                    {REF_LABEL[ref.type]}: {ref.title}
                  </span>
                  <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
                </a>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                нигде не используется
              </span>
            )
          ) : r.targetPath ? (
            <a
              href={r.targetPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-60 items-center gap-1 text-xs text-primary hover:underline"
            >
              <span className="truncate">{r.targetTitle ?? r.targetPath}</span>
              <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
            </a>
          ) : null}
        </div>
      ),
    },
    {
      id: "author",
      header: "Кто",
      sort: (r) => r.authorName ?? "",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.authorName ?? <span className="text-muted-foreground">админка</span>,
    },
    {
      id: "created",
      header: "Когда",
      sort: (r) => r.createdAt,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (r) => fmtRelative(r.createdAt),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Скопировать разметку"
                  onClick={() => copy(markdown(r), "Разметка")}
                />
              }
            >
              <CodeIcon />
            </TooltipTrigger>
            <TooltipContent>Разметка для MDX</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Скопировать ссылку"
                  onClick={() => copy(absolute(r.url), "Ссылка")}
                />
              }
            >
              <LinkIcon />
            </TooltipTrigger>
            <TooltipContent>Ссылка на файл</TooltipContent>
          </Tooltip>
          <RowActions onDelete={() => setDeleting(r)} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Файлы"
        description="Картинки и документы из конспектов, лаб и страниц, а также фото из комментариев и постов студентов. В текст файл проще вставить прямо из редактора — кнопкой «Файл», из буфера или перетаскиванием."
        actions={
          <>
            {data ? (
              <Badge variant="secondary" className="gap-1.5">
                <HardDriveIcon className="size-3.5" aria-hidden />
                {data.length} · {fmtBytes(total)}
              </Badge>
            ) : null}
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const picked = [...(e.target.files ?? [])];
                e.target.value = "";
                void upload(picked);
              }}
            />
            <Button
              onClick={() => input.current?.click()}
              disabled={uploading > 0}
            >
              {uploading > 0 ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              {uploading > 0 ? `Загрузка: ${uploading}` : "Загрузить"}
            </Button>
          </>
        }
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        rows={data ? rows : data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "created", dir: "desc" }}
        emptyTitle="Файлов пока нет"
        emptyDescription="Загрузите картинку или документ кнопкой выше или прямо из редактора текста."
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Удалить файл?"
        description={
          deleting?.place === "content" && deleting.usedIn.length > 0
            ? `«${deleting.name}» используется в текстах (${deleting.usedIn.length}) — там останется битая ссылка.`
            : `«${deleting?.name ?? ""}» пропадёт отовсюду, где его показывали.`
        }
        confirmLabel="Удалить"
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
