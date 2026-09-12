import { CalendarRangeIcon } from "lucide-react";

import type { Week } from "@/lib/api/types";
import { parityLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Compact "12-я неделя · Нечётная" chip. Renders nothing when the semester is not configured. */
export function WeekChip({
  week,
  className,
  size = "sm",
}: {
  week: Week;
  className?: string;
  size?: "sm" | "lg";
}) {
  if (!week.configured || week.number <= 0) return null;
  const parity = parityLabel(week.parity);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card font-medium whitespace-nowrap text-foreground",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        !week.inRange && "text-muted-foreground",
        className,
      )}
      title={
        week.inRange
          ? `Учебная неделя ${week.number}, ${parity.toLowerCase()}`
          : "Вне учебного семестра"
      }
    >
      <CalendarRangeIcon
        className={cn(
          "shrink-0 text-primary",
          size === "sm" ? "size-3.5" : "size-4",
        )}
        aria-hidden
      />
      <span>{week.number}-я неделя</span>
      <span className="text-muted-foreground" aria-hidden>
        ·
      </span>
      <span
        className={cn(
          week.parity === "odd"
            ? "text-primary"
            : "text-violet-600 dark:text-violet-400",
        )}
      >
        {parity}
      </span>
    </span>
  );
}
