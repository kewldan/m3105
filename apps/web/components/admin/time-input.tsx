"use client";

import { ClockIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { normalizeTime } from "@/lib/admin/datetime";
import { cn } from "@/lib/utils";

/** Text input for "HH:MM" with light masking; never a native time control. */
export function TimeInput({
  value,
  onChange,
  id,
  invalid,
  disabled,
  placeholder = "ЧЧ:ММ",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <InputGroup className={cn(className)}>
      <InputGroupAddon>
        <ClockIcon />
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={5}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          let v = e.target.value.replace(/[^\d:]/g, "");
          if (/^\d{3,}$/.test(v)) v = `${v.slice(0, 2)}:${v.slice(2, 4)}`;
          onChange(v.slice(0, 5));
        }}
        onBlur={() => onChange(normalizeTime(value))}
      />
    </InputGroup>
  );
}
