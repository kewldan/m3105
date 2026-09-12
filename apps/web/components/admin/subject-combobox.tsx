"use client";

import { ComboboxField } from "@/components/admin/combobox-field";
import type { Subject } from "@/lib/api/types";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

export function SubjectDot({
  color,
  className,
}: {
  color: Subject["color"] | "";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        subjectColor(color).dot,
        className,
      )}
      aria-hidden
    />
  );
}

/** Subject picker used across forms and filters. */
export function SubjectCombobox({
  subjects,
  value,
  onChange,
  allowClear = false,
  placeholder = "Выберите предмет",
  id,
  invalid,
  disabled,
}: {
  subjects: Pick<Subject, "id" | "name" | "shortName" | "color">[];
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  allowClear?: boolean;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const options = subjects.map((s) => ({
    value: s.id,
    label: s.shortName ? `${s.name} (${s.shortName})` : s.name,
    render: (
      <span className="flex items-center gap-2">
        <SubjectDot color={s.color} />
        <span className="truncate">{s.name}</span>
        {s.shortName ? (
          <span className="text-muted-foreground">· {s.shortName}</span>
        ) : null}
      </span>
    ),
  }));
  return (
    <ComboboxField
      id={id}
      options={options}
      value={value ?? null}
      onChange={onChange}
      allowClear={allowClear}
      placeholder={placeholder}
      invalid={invalid}
      disabled={disabled}
      emptyText={
        subjects.length === 0 ? "Сначала добавьте предмет" : "Ничего не найдено"
      }
    />
  );
}
