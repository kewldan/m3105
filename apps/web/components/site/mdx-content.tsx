import { AlertTriangleIcon } from "lucide-react";

import { type RenderedMdx, renderMdx } from "@/lib/mdx/render";
import { cn } from "@/lib/utils";

/** Server component: renders an MDX string inside themed prose. */
export async function MdxContent({
  source,
  className,
  size = "base",
}: {
  source: string;
  className?: string;
  size?: "sm" | "base" | "lg";
}) {
  const rendered = await renderMdx(source);
  return <MdxBody rendered={rendered} className={className} size={size} />;
}

/** Presentational half, usable when the MDX was already rendered (e.g. to reuse the TOC). */
export function MdxBody({
  rendered,
  className,
  size = "base",
}: {
  rendered: RenderedMdx;
  className?: string;
  size?: "sm" | "base" | "lg";
}) {
  if (rendered.error) {
    return (
      <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
        <AlertTriangleIcon
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div>
          <div className="font-medium">Не удалось отобразить содержимое</div>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {rendered.error}
          </pre>
        </div>
      </div>
    );
  }
  if (!rendered.content) return null;
  return (
    <div
      className={cn(
        "prose dark:prose-invert max-w-none",
        size === "sm" && "prose-sm",
        size === "lg" && "prose-lg",
        className,
      )}
    >
      {rendered.content}
    </div>
  );
}
