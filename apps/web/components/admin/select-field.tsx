"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Option } from "@/lib/admin/options";
import { cn } from "@/lib/utils";

/** Non-native single select over a fixed option list. */
export function SelectField<V extends string>({
  value,
  onChange,
  options,
  placeholder = "Выберите…",
  disabled,
  id,
  invalid,
  className,
  renderOption,
}: {
  value: V | null | undefined;
  onChange: (value: V) => void;
  options: Option<V>[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  className?: string;
  renderOption?: (o: Option<V>) => React.ReactNode;
}) {
  return (
    <Select
      value={value ?? null}
      onValueChange={(v) => {
        if (v != null) onChange(v as V);
      }}
      items={options.map((o) => ({
        value: o.value,
        label: renderOption ? renderOption(o) : o.label,
      }))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {renderOption ? renderOption(o) : o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
