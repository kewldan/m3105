import Link from "next/link";

import type { SubjectColor } from "@/lib/api/types";
import { subjectColor } from "@/lib/subject-colors";
import { subjectIcon } from "@/lib/subject-icons";
import { cn } from "@/lib/utils";

/** Colored pill with the subject name. Renders a link when `slug` is given. */
export function SubjectBadge({
  name,
  color,
  icon,
  slug,
  className,
  size = "sm",
}: {
  name: string;
  color: SubjectColor | "";
  /** When given, the icon replaces the color dot. */
  icon?: string;
  slug?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const c = subjectColor(color);
  const Icon = icon ? subjectIcon(icon) : null;
  const cls = cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors",
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
    c.badge,
    slug && "hover:opacity-80",
    className,
  );
  const inner = (
    <>
      {Icon ? (
        <Icon className="size-3 shrink-0" aria-hidden />
      ) : (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", c.dot)}
          aria-hidden
        />
      )}
      <span className="truncate">{name}</span>
    </>
  );
  if (slug) {
    return (
      <Link href={`/subjects/${slug}`} className={cls}>
        {inner}
      </Link>
    );
  }
  return <span className={cls}>{inner}</span>;
}
