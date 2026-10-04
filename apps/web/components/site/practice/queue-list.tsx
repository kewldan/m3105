import { Fragment } from "react";

import { UserAvatar } from "@/components/site/user-avatar";
import type { QueueEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Defences in hand-in order; the reserve starts after the teacher's capacity. */
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
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  mine && "font-medium",
                )}
              >
                {e.user.name}
                {mine ? " (вы)" : ""}
              </span>
              {e.carried ? (
                <span
                  className="shrink-0 rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300"
                  title="В прошлый раз была в резерве, поэтому идёт первой"
                >
                  перенос
                </span>
              ) : null}
              {e.late ? (
                <span
                  className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  title="Запись после заморозки очереди, поэтому в конце"
                >
                  поздняя
                </span>
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
