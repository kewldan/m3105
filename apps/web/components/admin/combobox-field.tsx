"use client";

import type { ReactNode } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

export type ComboOption<V extends string | number = string> = {
  value: V;
  label: string;
  /** Optional decorated label for the list. */
  render?: ReactNode;
};

/** Searchable single-value picker. Pass `allowClear` for nullable fields. */
export function ComboboxField<V extends string | number>({
  value,
  onChange,
  options,
  placeholder = "Начните вводить…",
  emptyText = "Ничего не найдено",
  disabled,
  id,
  invalid,
  allowClear = false,
  className,
}: {
  value: V | null | undefined;
  onChange: (value: V | null) => void;
  options: ComboOption<V>[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  allowClear?: boolean;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  return (
    <Combobox
      items={options}
      value={selected}
      onValueChange={(item) => onChange(item ? item.value : null)}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        showClear={allowClear}
        className={cn("w-full", className)}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: ComboOption<V>) => (
            <ComboboxItem key={String(item.value)} value={item}>
              {item.render ?? item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
