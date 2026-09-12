"use client";

import { FilterIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubjectColor } from "@/lib/api/types";
import { subjectIcon } from "@/lib/subject-icons";
import { cn } from "@/lib/utils";

export const ALL_SUBJECTS = "all";

export type SubjectOption = {
  slug: string;
  name: string;
  count?: number;
  icon?: string;
  color?: SubjectColor | "";
};

/** Non-native subject dropdown used by list pages. Value "all" means no filter. */
export function SubjectFilter({
  subjects,
  value,
  onChange,
  className,
}: {
  subjects: SubjectOption[];
  value: string;
  onChange: (slug: string) => void;
  className?: string;
}) {
  const items = [
    { value: ALL_SUBJECTS, label: "Все предметы" },
    ...subjects.map((s) => ({ value: s.slug, label: s.name })),
  ];
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v ?? ALL_SUBJECTS)}
      items={items}
    >
      <SelectTrigger
        className={cn("w-full sm:w-60", className)}
        aria-label="Фильтр по предмету"
      >
        <FilterIcon className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Все предметы" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => {
          const option = subjects.find((s) => s.slug === item.value);
          const count = option?.count;
          const Icon = option?.icon ? subjectIcon(option.icon) : null;
          return (
            <SelectItem key={item.value} value={item.value}>
              {Icon ? (
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              ) : null}
              <span className="flex-1 truncate">{item.label}</span>
              {count !== undefined ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count}
                </span>
              ) : null}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
