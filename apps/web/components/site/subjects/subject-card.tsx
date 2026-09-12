import {
  ArrowRightIcon,
  BookOpenTextIcon,
  FlaskConicalIcon,
  ListChecksIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";

import { SubjectIcon } from "@/components/site/subject-icon";
import type { SubjectWithCounts } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SubjectCard({
  subject,
  className,
}: {
  subject: SubjectWithCounts;
  className?: string;
}) {
  return (
    <Link
      href={`/subjects/${subject.slug}`}
      className={cn(
        "group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <SubjectIcon icon={subject.icon} color={subject.color} size="md" />
        <div className="min-w-0 flex-1">
          <div className="font-heading font-semibold leading-snug text-pretty">
            {subject.name}
          </div>
          {subject.teacher ? (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <UserRoundIcon className="size-3" aria-hidden />
              <span className="truncate">{subject.teacher}</span>
            </div>
          ) : null}
        </div>
        <ArrowRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <FlaskConicalIcon className="size-3.5" aria-hidden />
          {subject.labsCount} {plural(subject.labsCount, "лаба", "лабы", "лаб")}
        </span>
        <span className="inline-flex items-center gap-1">
          <BookOpenTextIcon className="size-3.5" aria-hidden />
          {subject.notesCount}{" "}
          {plural(subject.notesCount, "конспект", "конспекта", "конспектов")}
        </span>
        <span className="inline-flex items-center gap-1">
          <ListChecksIcon className="size-3.5" aria-hidden />
          {subject.quizzesCount}{" "}
          {plural(subject.quizzesCount, "квиз", "квиза", "квизов")}
        </span>
      </div>
    </Link>
  );
}
