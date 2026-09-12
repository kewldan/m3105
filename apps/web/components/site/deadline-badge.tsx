import { differenceInCalendarDays } from "date-fns";
import { AlertCircleIcon, ClockIcon } from "lucide-react";

import { DEFAULT_TZ, daysWord, inTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DeadlineState = "overdue" | "today" | "soon" | "later";

export function deadlineState(
  deadlineAt: string,
  now: string,
  tz = DEFAULT_TZ,
): { state: DeadlineState; days: number } {
  const days = differenceInCalendarDays(inTz(deadlineAt, tz), inTz(now, tz));
  const overdue = new Date(deadlineAt).getTime() < new Date(now).getTime();
  if (overdue) return { state: "overdue", days };
  if (days <= 0) return { state: "today", days: 0 };
  if (days <= 3) return { state: "soon", days };
  return { state: "later", days };
}

export function deadlineLabel(
  deadlineAt: string,
  now: string,
  tz = DEFAULT_TZ,
): string {
  const { state, days } = deadlineState(deadlineAt, now, tz);
  switch (state) {
    case "overdue":
      return days === 0
        ? "Срок прошёл сегодня"
        : `Просрочено на ${daysWord(Math.abs(days))}`;
    case "today":
      return "Сегодня";
    case "soon":
      return days === 1 ? "Завтра" : `Через ${daysWord(days)}`;
    default:
      return `Через ${daysWord(days)}`;
  }
}

const STYLE: Record<DeadlineState, string> = {
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
  today:
    "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-300",
  soon: "border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-300",
  later: "border-border bg-muted/60 text-muted-foreground",
};

/** Countdown pill for a deadline, deterministic given `now` from the API. */
export function DeadlineBadge({
  deadlineAt,
  now,
  tz = DEFAULT_TZ,
  className,
}: {
  deadlineAt: string | null;
  now: string;
  tz?: string;
  className?: string;
}) {
  if (!deadlineAt) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        <ClockIcon className="size-3" aria-hidden />
        Без дедлайна
      </span>
    );
  }
  const { state } = deadlineState(deadlineAt, now, tz);
  const Icon = state === "overdue" ? AlertCircleIcon : ClockIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STYLE[state],
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {deadlineLabel(deadlineAt, now, tz)}
    </span>
  );
}
