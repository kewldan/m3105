import { LibraryIcon } from "lucide-react";
import Link from "next/link";

import { SubjectIcon } from "@/components/site/subject-icon";
import type { SubjectWithCounts } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Subject navigation for the notes library. Vertical sticky list on lg+,
 * horizontally scrollable chips on smaller screens. Plain links, so the
 * selection lives in the URL and is shareable.
 */
export function SubjectRail({
  subjects,
  active,
  total,
}: {
  subjects: SubjectWithCounts[];
  active?: string;
  total: number;
}) {
  const items = [
    {
      slug: "",
      name: "Все предметы",
      shortName: "Все",
      count: total,
      icon: null as string | null,
      color: "" as SubjectWithCounts["color"] | "",
    },
    ...subjects.map((s) => ({
      slug: s.slug,
      name: s.name,
      shortName: s.shortName || s.name,
      count: s.notesCount,
      icon: s.icon as string | null,
      color: s.color as SubjectWithCounts["color"] | "",
    })),
  ];

  return (
    <nav aria-label="Предметы" className="min-w-0 lg:sticky lg:top-24">
      {/* Mobile / tablet: chips */}
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {items.map((it) => {
          const isActive = (active ?? "") === it.slug;
          return (
            <li key={it.slug || "all"} className="shrink-0">
              <Link
                href={
                  it.slug
                    ? `/notes?subject=${encodeURIComponent(it.slug)}`
                    : "/notes"
                }
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground",
                  it.count === 0 && !isActive && "opacity-60",
                )}
              >
                {it.icon !== null ? (
                  <SubjectIcon
                    icon={it.icon}
                    color={it.color}
                    size="sm"
                    className={cn(
                      "size-5 rounded-md [&_svg]:size-3",
                      isActive && "bg-white/20 text-primary-foreground",
                    )}
                  />
                ) : (
                  <LibraryIcon className="size-3.5" aria-hidden />
                )}
                {it.shortName}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isActive
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {it.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Desktop: vertical list */}
      <ul className="hidden space-y-0.5 lg:block">
        {items.map((it) => {
          const isActive = (active ?? "") === it.slug;
          return (
            <li key={it.slug || "all"}>
              <Link
                href={
                  it.slug
                    ? `/notes?subject=${encodeURIComponent(it.slug)}`
                    : "/notes"
                }
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  it.count === 0 && !isActive && "opacity-60",
                )}
              >
                {it.icon !== null ? (
                  <SubjectIcon icon={it.icon} color={it.color} size="sm" />
                ) : (
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <LibraryIcon className="size-3.5" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {it.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
