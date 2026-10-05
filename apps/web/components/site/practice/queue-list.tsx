import { Fragment, type ReactNode } from "react";

import { GroupBadge } from "@/components/site/group-badge";
import { UserAvatar } from "@/components/site/user-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { QueueEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** A small mark with an explanation on hover or tap (tooltips do not open on phones). */
function QueueTag({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        className={cn(
          "shrink-0 cursor-help rounded-full px-2 py-0.5 text-[11px] font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 p-2.5 text-xs text-pretty">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Defenses in hand-in order; the reserve starts after the teacher's capacity. */
export function QueueList({
  queue,
  meId,
}: {
  queue: QueueEntry[];
  meId?: number;
}) {
  return (
    <ol className="divide-y overflow-hidden rounded-xl border bg-muted/30">
      {queue.map((e, i) => {
        const mine = meId === e.user.id;
        return (
          <Fragment key={`${e.user.id}:${e.lab.id}`}>
            {e.reserve && !queue[i - 1]?.reserve ? (
              <li className="bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                Резерв — примут, если останется время; в следующий раз эти
                защиты пойдут первыми
              </li>
            ) : null}
            <li
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                e.reserve && "opacity-75",
              )}
            >
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <UserAvatar
                name={e.user.name}
                photoUrl={e.user.photoUrl}
                size="sm"
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={cn("truncate text-sm", mine && "font-medium")}>
                  {e.user.name}
                  {mine ? " (вы)" : ""}
                </span>
                <GroupBadge group={e.user.group} />
              </span>
              {e.carried ? (
                <QueueTag
                  label={`перенос${e.missed > 1 ? ` ×${e.missed}` : ""}`}
                  className="bg-sky-500/12 text-sky-700 dark:text-sky-300"
                >
                  {e.missed > 1
                    ? `Эту защиту не успели принять ${e.missed} сдачи подряд, поэтому она идёт раньше остальных переносов.`
                    : "Эту защиту не успели принять на прошлой сдаче, поэтому сейчас она идёт в начале очереди."}
                </QueueTag>
              ) : null}
              {e.late ? (
                <QueueTag
                  label="поздняя"
                  className="bg-muted text-muted-foreground"
                >
                  Запись сделана после 20:00 накануне, когда порядок уже
                  заморозили. Такие записи встают в конец по времени записи и
                  никого не сдвигают.
                </QueueTag>
              ) : null}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                №{e.lab.number}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
