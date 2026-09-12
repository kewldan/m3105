"use client";

import { useState } from "react";

import { DatePicker } from "@/components/admin/date-picker";
import { TimeInput } from "@/components/admin/time-input";
import { joinDateTime, splitDateTime, TIME_RE } from "@/lib/admin/datetime";
import { cn } from "@/lib/utils";

/**
 * Date + time in the site timezone (Moscow). `value` is an RFC3339 string
 * or null; the change handler receives the same shape.
 */
export function DateTimePicker({
  value,
  onChange,
  defaultTime = "23:59",
  id,
  invalid,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  defaultTime?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const initial = splitDateTime(value);
  const [time, setTime] = useState(initial.time || defaultTime);
  const date = initial.date;

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate) {
      onChange(null);
      return;
    }
    if (!TIME_RE.test(nextTime)) return;
    onChange(joinDateTime(nextDate, nextTime));
  }

  return (
    <div
      className={cn("grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2", className)}
    >
      <DatePicker
        id={id}
        value={date || null}
        invalid={invalid}
        disabled={disabled}
        onChange={(d) => commit(d ?? "", time)}
      />
      <TimeInput
        value={time}
        invalid={invalid || (time !== "" && !TIME_RE.test(time))}
        disabled={disabled || !date}
        onChange={(t) => {
          setTime(t);
          commit(date, t);
        }}
      />
      <p className="col-span-2 text-xs text-muted-foreground">
        Время по Москве (Europe/Moscow).
      </p>
    </div>
  );
}
