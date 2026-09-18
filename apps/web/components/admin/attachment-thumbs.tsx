import { fileIcon } from "@/components/site/attachments/gallery";
import type { Attachment } from "@/lib/api/types";
import { isImageType } from "@/lib/api/upload";
import { previewSrc } from "@/lib/files/preview";
import { fmtBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Small previews for moderation tables; each opens the file in a new tab. */
export function AttachmentThumbs({
  items,
  className,
}: {
  items: Attachment[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((a) => {
        const Icon = fileIcon(a.contentType);
        return (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${a.name} · ${fmtBytes(a.size)}`}
            className="flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted/40 transition-colors hover:border-primary/50"
          >
            {isImageType(a.contentType) ? (
              // biome-ignore lint/performance/noImgElement: files are served by the API, not Next's image pipeline.
              <img
                src={previewSrc(a.url, 160)}
                alt={a.name}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <Icon className="size-4 text-muted-foreground" aria-hidden />
            )}
          </a>
        );
      })}
    </div>
  );
}
