import { ArrowRightIcon, BookOpenTextIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/site/empty-state";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { SubjectIcon } from "@/components/site/subject-icon";
import type { Note, SubjectWithCounts } from "@/lib/api/types";
import { fmtRelative, plural } from "@/lib/format";

import { ContinueReading } from "./continue-reading";

type Overview = {
  subject: SubjectWithCounts;
  count: number;
  updatedAt: string | null;
  latest: Note | null;
};

function build(subjects: SubjectWithCounts[], notes: Note[]): Overview[] {
  const bySubject = new Map<number, Note[]>();
  for (const n of notes) {
    const list = bySubject.get(n.subjectId) ?? [];
    list.push(n);
    bySubject.set(n.subjectId, list);
  }
  return subjects.map((subject) => {
    const list = bySubject.get(subject.id) ?? [];
    let updatedAt: string | null = null;
    let latest: Note | null = null;
    for (const n of list) {
      if (!updatedAt || n.updatedAt > updatedAt) updatedAt = n.updatedAt;
      if (!latest || n.number > latest.number) latest = n;
    }
    return { subject, count: list.length, updatedAt, latest };
  });
}

/** Landing pane of the library: one card per subject plus «Продолжить чтение». */
export function NotesOverview({
  subjects,
  notes,
}: {
  subjects: SubjectWithCounts[];
  notes: Note[];
}) {
  const items = build(subjects, notes).filter((o) => o.count > 0);
  return (
    <div className="space-y-6">
      <ContinueReading />
      {items.length === 0 ? (
        <EmptyState
          icon={BookOpenTextIcon}
          title="Конспектов пока нет"
          description="Они появятся здесь, как только будут опубликованы."
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map(({ subject, count, updatedAt, latest }) => (
            <StaggerItem key={subject.id} className="h-full">
              <Link
                href={`/notes?subject=${encodeURIComponent(subject.slug)}`}
                className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start gap-3">
                  <SubjectIcon
                    icon={subject.icon}
                    color={subject.color}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-semibold leading-snug text-pretty group-hover:text-primary">
                      {subject.name}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {count} {plural(count, "лекция", "лекции", "лекций")}
                      {updatedAt
                        ? ` · обновлено ${fmtRelative(updatedAt)}`
                        : ""}
                    </div>
                  </div>
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </div>
                {latest ? (
                  <div className="mt-auto truncate rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                    Последняя:{" "}
                    <span className="text-foreground">
                      {latest.number}. {latest.title}
                    </span>
                  </div>
                ) : null}
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
