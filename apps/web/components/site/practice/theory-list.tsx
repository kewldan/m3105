import { GraduationCapIcon } from "lucide-react";

import { GroupBadge } from "@/components/site/group-badge";
import { UserAvatar } from "@/components/site/user-avatar";
import type { Participant } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Theory-min marks of a session; for this count the total. */
export function theoryTotal(theory: Participant[]): number {
  return theory.reduce((n, p) => n + p.labs.length, 0);
}

/**
 * Who comes to the theory min and for which labs. Not a queue: it only shows
 * how many come, so that enough mentors are there.
 */
export function TheoryList({
  theory,
  meId,
  className,
}: {
  theory: Participant[];
  meId?: number;
  className?: string;
}) {
  const total = theoryTotal(theory);
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-violet-500/25 bg-violet-500/5",
        className,
      )}
    >
      <h3 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
        <GraduationCapIcon className="size-3.5" aria-hidden />
        Теормин: {total} {plural(total, "отметка", "отметки", "отметок")} ·{" "}
        {theory.length}{" "}
        {plural(theory.length, "человек", "человека", "человек")}
      </h3>
      <ul className="divide-y border-t border-violet-500/15">
        {theory.map((p) => {
          const mine = meId === p.user.id;
          return (
            <li key={p.user.id} className="flex items-center gap-3 px-3 py-2">
              <UserAvatar
                name={p.user.name}
                photoUrl={p.user.photoUrl}
                size="sm"
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={cn("truncate text-sm", mine && "font-medium")}>
                  {p.user.name}
                  {mine ? " (вы)" : ""}
                </span>
                <GroupBadge group={p.user.group} />
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {p.labs.map((l) => `№${l.number}`).join(", ")}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
