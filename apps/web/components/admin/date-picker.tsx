"use client";

import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { ru } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { dateToYmd, ymdToDate } from "@/lib/admin/datetime";
import { fmtDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Date-only picker; value is "YYYY-MM-DD" or null. */
export function DatePicker({
  value,
  onChange,
  placeholder = "Выберите дату",
  allowClear = true,
  disabled,
  id,
  invalid,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = ymdToDate(value);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              disabled={disabled}
              aria-invalid={invalid || undefined}
              className="w-full justify-start font-normal"
            />
          }
        >
          <CalendarIcon
            className="text-muted-foreground"
            data-icon="inline-start"
          />
          {value ? (
            fmtDateOnly(value)
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={(d) => {
              onChange(d ? dateToYmd(d) : null);
              setOpen(false);
            }}
            locale={ru}
            weekStartsOn={1}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
          />
        </PopoverContent>
      </Popover>
      {allowClear && value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Очистить дату"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}
