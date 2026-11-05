"use client";

import { useEffect, useMemo, useState } from "react";

import { Toggle } from "@/components/ui/toggle";
import { adminApi } from "@/lib/api/admin";
import type { StudyGroup } from "@/lib/api/types";
import { formatAudience } from "@/lib/audience";
import { cn } from "@/lib/utils";

let groupsCache: Promise<StudyGroup[]> | null = null;

/** Groups of the course list, loaded once per page. */
function useStudyGroups(): StudyGroup[] | null {
  const [groups, setGroups] = useState<StudyGroup[] | null>(null);
  useEffect(() => {
    groupsCache ??= adminApi.studyGroups().catch(() => {
      groupsCache = null;
      return [];
    });
    let live = true;
    void groupsCache.then((g) => {
      if (live) setGroups(g);
    });
    return () => {
      live = false;
    };
  }, []);
  return groups;
}

const toggleClass =
  "border data-[pressed]:border-primary data-[pressed]:bg-primary/10 data-[pressed]:text-primary aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary";

/**
 * Who a subject, lab, note, event or session is for: nobody selected — for
 * everyone; whole streams; single groups. A group of a selected stream is
 * already covered and is shown as such.
 */
export function AudiencePicker({
  value,
  onChange,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
}) {
  const groups = useStudyGroups();
  const streams = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const g of groups ?? []) {
      if (g.stream <= 0) continue;
      map.set(g.stream, [...(map.get(g.stream) ?? []), g.name]);
    }
    if (map.size === 0) for (let n = 1; n <= 5; n++) map.set(n, []);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [groups]);
  const loose = (groups ?? []).filter((g) => g.stream <= 0).map((g) => g.name);

  const has = (t: string) => value.includes(t);
  const toggle = (t: string, on: boolean) => {
    let next = value.filter((v) => v !== t);
    if (on) next = [...next, t];
    // A stream covers its groups: drop them to keep the list short.
    if (on && t.startsWith("stream:")) {
      const covered = streams.find(([n]) => `stream:${n}` === t)?.[1] ?? [];
      next = next.filter((v) => !covered.some((g) => v === `group:${g}`));
    }
    onChange(next);
  };

  return (
    <div id={id} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          size="sm"
          className={toggleClass}
          pressed={value.length === 0}
          onPressedChange={() => onChange([])}
        >
          Для всех
        </Toggle>
        {streams.map(([n]) => (
          <Toggle
            key={n}
            size="sm"
            className={toggleClass}
            pressed={has(`stream:${n}`)}
            onPressedChange={(on) => toggle(`stream:${n}`, on)}
          >
            Поток {n}
          </Toggle>
        ))}
      </div>
      {groups && groups.length > 0 ? (
        <details className="group rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm text-muted-foreground select-none">
            Отдельные группы
          </summary>
          <div className="mt-2 space-y-2">
            {[...streams, ...(loose.length ? [[0, loose] as const] : [])].map(
              ([n, names]) =>
                names.length === 0 ? null : (
                  <div key={n} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {n ? `Поток ${n}` : "Без потока"}
                    </span>
                    {names.map((g) => {
                      const covered = n > 0 && has(`stream:${n}`);
                      return (
                        <Toggle
                          key={g}
                          size="sm"
                          className={cn(toggleClass, "tabular-nums")}
                          pressed={covered || has(`group:${g}`)}
                          disabled={covered}
                          onPressedChange={(on) => toggle(`group:${g}`, on)}
                        >
                          {g}
                        </Toggle>
                      );
                    })}
                  </div>
                ),
            )}
          </div>
        </details>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {value.length === 0
          ? "Видно всем. Студенты других потоков тоже увидят это в своих списках."
          : `Только: ${formatAudience(value)}. Остальным — по кнопке «Показать всё».`}
      </p>
    </div>
  );
}
