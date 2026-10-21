import type { GradeColumn, GradeParts, SubjectColor } from "@/lib/api/types";
import { fmtScore } from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

/**
 * Score breakdown: one thin bar per sheet column. Columns missing from the
 * student's tab (another stream with other labs) have no key in `parts` and
 * are left out; an empty cell is null and shows as «—».
 */
export function PartBars({
  columns,
  parts,
  color,
  className,
}: {
  columns: GradeColumn[];
  parts: GradeParts;
  color: SubjectColor | "";
  className?: string;
}) {
  const present = columns.filter((col) => col.key in parts);
  if (present.length === 0) return null;
  return (
    <ul className={cn("grid gap-x-4 gap-y-2 sm:grid-cols-2", className)}>
      {present.map((col) => {
        const v = parts[col.key] ?? null;
        const p =
          col.max > 0 && v != null ? Math.min(100, (v / col.max) * 100) : 0;
        // Сверх максимума — бонус («плюсики» за то, что сверх задания).
        const bonus = col.max > 0 && v != null && v > col.max ? v - col.max : 0;
        return (
          <li key={col.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">
                {col.label}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {bonus ? (
                  <>
                    {fmtScore(col.max)}
                    <span
                      className="ml-1 rounded bg-emerald-500/15 px-1 text-emerald-700 dark:text-emerald-300"
                      title="Бонус сверх максимума за лабу"
                    >
                      +{fmtScore(bonus)}
                    </span>
                  </>
                ) : (
                  fmtScore(v)
                )}
                {col.max > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    / {fmtScore(col.max)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  subjectColor(color).dot,
                )}
                style={{ width: `${p}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
