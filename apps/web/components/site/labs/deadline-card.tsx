"use client";

import { CalendarClockIcon, InfoIcon } from "lucide-react";

import { DeadlineBadge, deadlineState } from "@/components/site/deadline-badge";
import { DoneToggle } from "@/components/site/labs/done-toggle";
import { SignupButton } from "@/components/site/labs/signup-button";
import { useLabsDone } from "@/components/site/labs/use-labs-done";
import { fmtTime, fmtWeekdayDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DeadlineCard({
  labId,
  subjectSlug,
  deadlineAt,
  deadlineNote,
  now,
  tz,
}: {
  labId: number;
  subjectSlug: string;
  deadlineAt: string | null;
  deadlineNote: string;
  now: string;
  tz: string;
}) {
  const { isDone, toggle, signedIn } = useLabsDone();
  const finished = isDone(labId);
  const state = deadlineAt ? deadlineState(deadlineAt, now, tz).state : null;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        finished
          ? "border-emerald-500/40 bg-emerald-500/8"
          : state === "overdue"
            ? "border-destructive/30 bg-destructive/5"
            : state === "today" || state === "soon"
              ? "border-amber-500/40 bg-amber-500/8"
              : "bg-card",
      )}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <CalendarClockIcon className="size-3.5" aria-hidden />
            Дедлайн
          </div>
          {deadlineAt ? (
            <>
              <div className="font-heading text-xl font-semibold first-letter:uppercase sm:text-2xl">
                {fmtWeekdayDate(deadlineAt, tz)}
              </div>
              <div className="text-sm text-muted-foreground">
                до {fmtTime(deadlineAt, tz)}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {finished ? (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    Вы отметили как сданную
                  </span>
                ) : (
                  <DeadlineBadge deadlineAt={deadlineAt} now={now} tz={tz} />
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <InfoIcon className="size-3" aria-hidden />
                  Дедлайн мягкий: сдать можно и позже, но лучше не тянуть
                </span>
              </div>
            </>
          ) : (
            <div className="font-heading text-lg font-semibold">
              Дедлайн пока не назначен
            </div>
          )}
          {deadlineNote ? (
            <p className="text-sm text-pretty">{deadlineNote}</p>
          ) : null}
          <SignupButton
            labId={labId}
            subjectSlug={subjectSlug}
            tz={tz}
            className="pt-1"
          />
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5 text-center">
          <DoneToggle
            checked={finished}
            disabled={!signedIn}
            onToggle={() => toggle(labId)}
          />
          <span className="text-[11px] font-medium text-muted-foreground">
            {finished ? "Сдано" : signedIn ? "Сдал(а)?" : "Войдите"}
          </span>
        </div>
      </div>
    </div>
  );
}
