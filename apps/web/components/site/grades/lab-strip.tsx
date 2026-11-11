import { CheckIcon, HourglassIcon } from "lucide-react";

import type {
  GradeColumn,
  GradeLab,
  GradeLabs,
  GradeParts,
  SubjectColor,
} from "@/lib/api/types";
import { fmtDelta, fmtScore } from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

/** «+2», «−1,5»: pluses and minuses of a lab as one line. */
function modifiers(lab: GradeLab): string {
  const out: string[] = [];
  if (lab.plus) out.push(`+${fmtScore(lab.plus)}`);
  if (lab.minus) out.push(`−${fmtScore(lab.minus)}`);
  return out.join(" ");
}

function LabCard({
  column,
  lab,
  points,
  color,
}: {
  column: GradeColumn;
  lab: GradeLab;
  points: number | null;
  color: SubjectColor | "";
}) {
  const mods = modifiers(lab);
  const late = (lab.stage ?? 0) > 0;
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border px-2.5 py-2",
        lab.status === "done" && subjectColor(color).soft,
        lab.status === "accepted" &&
          "border-dashed border-amber-500/50 bg-amber-500/5",
        lab.status === "none" && "border-dashed text-muted-foreground",
      )}
    >
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="truncate">{column.label}</span>
        {lab.status === "done" ? (
          <CheckIcon
            className={cn("size-3.5 shrink-0", subjectColor(color).text)}
            aria-label="Сдана"
          />
        ) : lab.status === "accepted" ? (
          <HourglassIcon
            className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-label="Ждёт теормина"
          />
        ) : null}
      </div>
      {lab.status === "done" ? (
        <div className="text-lg font-semibold tabular-nums leading-none">
          {fmtScore(points ?? lab.points)}
        </div>
      ) : lab.status === "accepted" ? (
        <div
          className="text-sm leading-tight text-amber-700 dark:text-amber-300"
          title="Лаба принята, но без теормина баллов не даёт"
        >
          теормин
          {lab.potential != null ? (
            <span className="block text-xs text-muted-foreground">
              на кону{" "}
              <span className="font-medium tabular-nums text-foreground">
                {fmtScore(lab.potential)}
              </span>
            </span>
          ) : null}
        </div>
      ) : (
        <div className="text-lg leading-none">—</div>
      )}
      {mods || late ? (
        <div className="flex flex-wrap gap-1 text-[11px] tabular-nums">
          {mods ? (
            <span
              className={cn(
                "rounded px-1",
                (lab.plus ?? 0) >= (lab.minus ?? 0)
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
              )}
              title={
                lab.bonus
                  ? `Плюсики и минусы: ${fmtDelta(lab.bonus)} к лабе`
                  : "Плюсики и минусы"
              }
            >
              {mods}
              {lab.bonus ? ` · ${fmtDelta(lab.bonus)}` : ""}
            </span>
          ) : null}
          {late ? (
            <span
              className="rounded bg-orange-500/15 px-1 text-orange-700 dark:text-orange-300"
              title={`Просрочка, ${lab.stage}-я ступень`}
            >
              ×{fmtScore(lab.factor)}
              {lab.lateLoss ? ` · ${fmtDelta(-lab.lateLoss)}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Labs of one student as cards: points with what pluses, minuses and the
 * deadline did, or — for a lab accepted without the theory — what passing
 * it would give.
 */
export function LabStrip({
  columns,
  parts,
  labs,
  color,
  className,
}: {
  columns: GradeColumn[];
  parts: GradeParts;
  labs: GradeLabs;
  color: SubjectColor | "";
  className?: string;
}) {
  const present = columns.filter((c) => c.key in labs);
  if (present.length === 0) return null;
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5",
        className,
      )}
    >
      {present.map((c) => (
        <LabCard
          key={c.key}
          column={c}
          lab={labs[c.key]}
          points={parts[c.key] ?? null}
          color={color}
        />
      ))}
    </ul>
  );
}
