"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Attachment } from "@/lib/api/types";
import { isImageType } from "@/lib/api/upload";
import { previewSrc, previewSrcSet } from "@/lib/files/preview";
import { fmtBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export function fileIcon(contentType: string) {
  if (contentType === "application/pdf" || contentType.startsWith("text/"))
    return FileTextIcon;
  if (/zip|compressed|rar|tar|gzip/.test(contentType)) return FileArchiveIcon;
  if (/sheet|excel|csv/.test(contentType)) return FileSpreadsheetIcon;
  if (contentType.startsWith("video/")) return FileVideoIcon;
  return FileIcon;
}

/** Картинки и PDF открываются во вкладке, остальное сразу скачивается. */
const opensInBrowser = (a: Attachment) =>
  isImageType(a.contentType) || a.contentType === "application/pdf";

/** A non-image attachment: icon, name and size, opens or downloads the file. */
export function FileChip({
  file,
  className,
}: {
  file: Attachment;
  className?: string;
}) {
  const Icon = fileIcon(file.contentType);
  const inTab = opensInBrowser(file);
  return (
    <a
      href={inTab ? file.url : `${file.url}?download=1`}
      target={inTab ? "_blank" : undefined}
      rel={inTab ? "noopener noreferrer" : undefined}
      className={cn(
        "group inline-flex max-w-full min-w-0 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-muted/50",
        className,
      )}
    >
      <Icon
        className="size-5 shrink-0 text-muted-foreground group-hover:text-primary"
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block truncate font-medium">{file.name}</span>
        <span className="block text-xs text-muted-foreground">
          {fmtBytes(file.size)}
        </span>
      </span>
      {inTab ? (
        <ExternalLinkIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : (
        <DownloadIcon
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </a>
  );
}

/**
 * Attachments under a comment or post: one picture is shown whole, several
 * become a grid of square previews; a click opens them full screen. Other
 * files are listed as chips.
 */
export function AttachmentGallery({
  items,
  compact = false,
  className,
}: {
  items: Attachment[];
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (items.length === 0) return null;
  const images = items.filter((a) => isImageType(a.contentType));
  const others = items.filter((a) => !isImageType(a.contentType));

  return (
    <div className={cn("space-y-2", className)}>
      {images.length === 1 ? (
        <button
          type="button"
          onClick={() => setOpen(0)}
          className="block max-w-full overflow-hidden rounded-xl border bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          aria-label={`Открыть ${images[0].name}`}
        >
          {/* biome-ignore lint/performance/noImgElement: files are served by the API, not Next's image pipeline. */}
          <img
            src={previewSrc(images[0].url, 640)}
            srcSet={previewSrcSet(images[0].url, [640, 1280], images[0].width)}
            sizes="(min-width: 768px) 640px, 100vw"
            alt={images[0].name}
            width={images[0].width ?? undefined}
            height={images[0].height ?? undefined}
            loading="lazy"
            decoding="async"
            className={cn(
              "h-auto w-auto max-w-full object-contain",
              compact ? "max-h-60" : "max-h-96",
            )}
          />
        </button>
      ) : images.length > 1 ? (
        <div
          className={cn(
            "grid gap-1.5",
            compact
              ? "max-w-sm grid-cols-3"
              : "max-w-lg grid-cols-2 sm:grid-cols-3",
          )}
        >
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setOpen(i)}
              className="aspect-square overflow-hidden rounded-lg border bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Открыть ${img.name}`}
            >
              {/* biome-ignore lint/performance/noImgElement: files are served by the API, not Next's image pipeline. */}
              <img
                src={previewSrc(img.url, 320)}
                srcSet={previewSrcSet(img.url, [320, 640], img.width)}
                sizes="(min-width: 640px) 170px, 33vw"
                alt={img.name}
                loading="lazy"
                decoding="async"
                className="size-full object-cover transition-transform hover:scale-105"
              />
            </button>
          ))}
        </div>
      ) : null}
      {others.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {others.map((f) => (
            <FileChip key={f.id} file={f} className="max-w-72" />
          ))}
        </div>
      ) : null}
      <Lightbox images={images} index={open} onIndexChange={setOpen} />
    </div>
  );
}

/** Full-screen viewer with arrows (buttons and keyboard) between pictures. */
function Lightbox({
  images,
  index,
  onIndexChange,
}: {
  images: Attachment[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const current = index === null ? null : images[index];
  const many = images.length > 1;
  const step = (delta: number) => {
    if (index === null) return;
    onIndexChange((index + delta + images.length) % images.length);
  };

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(o) => {
        if (!o) onIndexChange(null);
      }}
    >
      <DialogContent
        className="gap-3 p-3 sm:max-w-[min(96vw,72rem)]"
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        {current ? (
          <>
            <DialogTitle className="truncate pr-10 text-sm font-medium">
              {current.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Просмотр вложения
              {many ? `, ${(index ?? 0) + 1} из ${images.length}` : ""}
            </DialogDescription>
            <div className="relative flex min-h-0 items-center justify-center">
              {/* biome-ignore lint/performance/noImgElement: files are served by the API, not Next's image pipeline. */}
              <img
                src={previewSrc(current.url, 1920)}
                srcSet={previewSrcSet(current.url, [1280, 1920], current.width)}
                sizes="96vw"
                alt={current.name}
                className="max-h-[calc(100dvh-9rem)] w-auto max-w-full rounded-lg object-contain"
              />
              {many ? (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => step(-1)}
                    aria-label="Предыдущее"
                    className="absolute left-2 opacity-80 hover:opacity-100"
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => step(1)}
                    aria-label="Следующее"
                    className="absolute right-2 opacity-80 hover:opacity-100"
                  >
                    <ChevronRightIcon />
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {many ? `${(index ?? 0) + 1} из ${images.length} · ` : ""}
                {current.width && current.height
                  ? `${current.width}×${current.height} · `
                  : ""}
                {fmtBytes(current.size)}
              </span>
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  render={
                    <a
                      href={current.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  Оригинал
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<a href={`${current.url}?download=1`} />}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Скачать
                </Button>
              </span>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
