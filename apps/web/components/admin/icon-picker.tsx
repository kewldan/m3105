"use client";

import { CheckIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SubjectColor } from "@/lib/api/types";
import { subjectColor } from "@/lib/subject-colors";
import { SUBJECT_ICONS } from "@/lib/subject-icons";
import { cn } from "@/lib/utils";

/** Grid of curated subject icons with a label filter. */
export function IconPicker({
  value,
  onChange,
  color,
  id,
}: {
  value: string;
  onChange: (key: string) => void;
  color?: SubjectColor;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUBJECT_ICONS;
    return SUBJECT_ICONS.filter(
      (i) => i.label.toLowerCase().includes(q) || i.key.includes(q),
    );
  }, [query]);
  const tint = subjectColor(color ?? "blue");

  return (
    <div className="min-w-0 space-y-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти иконку…"
          className="h-8 pl-8"
        />
      </div>
      <fieldset className="grid max-h-44 min-w-0 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto rounded-lg border p-1.5">
        <legend className="sr-only">Иконка предмета</legend>
        {items.map(({ key, label, icon: Icon }) => {
          const active = key === value;
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={label}
                    onClick={() => onChange(key)}
                    className={cn(
                      "relative flex h-9 min-w-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      active && cn("border-current", tint.badge),
                    )}
                  />
                }
              >
                <Icon className="size-4" />
                {active ? (
                  <CheckIcon className="absolute -top-1 -right-1 size-3 rounded-full bg-primary p-0.5 text-primary-foreground" />
                ) : null}
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          );
        })}
        {items.length === 0 ? (
          <div className="col-span-full py-4 text-center text-xs text-muted-foreground">
            Ничего не найдено
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}
