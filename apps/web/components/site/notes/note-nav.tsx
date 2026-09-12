import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import type { Note } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function NavCard({
  note,
  direction,
}: {
  note: Note | null;
  direction: "prev" | "next";
}) {
  if (!note) return <div className="hidden sm:block" />;
  const isNext = direction === "next";
  return (
    <Link
      href={`/notes/${note.subjectSlug}/${note.slug}`}
      className={cn(
        "group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        isNext ? "text-right sm:flex-row-reverse" : "",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        {isNext ? (
          <ArrowRightIcon className="size-4" />
        ) : (
          <ArrowLeftIcon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">
          {isNext ? "Следующая лекция" : "Предыдущая лекция"}
        </span>
        <span className="block truncate font-medium">
          {note.number}. {note.title}
        </span>
      </span>
    </Link>
  );
}

/** Previous / next lecture links at the bottom of a note. */
export function NoteNav({
  prev,
  next,
}: {
  prev: Note | null;
  next: Note | null;
}) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Соседние лекции" className="grid gap-3 sm:grid-cols-2">
      <NavCard note={prev} direction="prev" />
      <NavCard note={next} direction="next" />
    </nav>
  );
}
