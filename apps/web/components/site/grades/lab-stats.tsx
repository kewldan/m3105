import { HourglassIcon, SparklesIcon } from "lucide-react";

import { GroupBadge } from "@/components/site/group-badge";
import { UserAvatar } from "@/components/site/user-avatar";
import type {
  GradeColumn,
  GradeEntry,
  GradeLabs,
  GradeSourceSummary,
} from "@/lib/api/types";
import { plural } from "@/lib/format";
import {
  fmtCount,
  fmtDelta,
  fmtScore,
  labStats,
  labTotals,
  letterFor,
} from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Course (or group) progress on each lab: done, waiting for the theory, not yet. */
export function LabProgress({
  rows,
  columns,
  source,
}: {
  rows: GradeEntry[];
  columns: GradeColumn[];
  source: GradeSourceSummary;
}) {
  const stats = labStats(rows, columns).filter((s) => s.count > 0);
  if (stats.length === 0) return null;
  const c = subjectColor(source.subjectColor);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium">Лабы</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", c.dot)} aria-hidden />
            сдана
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500" aria-hidden />
            ждёт теормина
          </span>
        </div>
      </div>
      <ul className="space-y-2.5">
        {stats.map((s) => (
          <li
            key={s.column.key}
            className="grid grid-cols-[4.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[5rem_1fr_15rem]"
          >
            <span className="truncate text-sm">{s.column.label}</span>
            <span
              className="flex h-2 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${s.column.label}: сдали ${s.done} из ${s.count}, ждут теормина ${s.accepted}`}
            >
              <span
                className={cn("h-full", c.dot)}
                style={{ width: `${(s.done / s.count) * 100}%` }}
              />
              <span
                className="h-full bg-amber-500"
                style={{ width: `${(s.accepted / s.count) * 100}%` }}
              />
            </span>
            <span className="col-start-2 text-xs tabular-nums text-muted-foreground sm:col-start-3 sm:text-right">
              {s.done} из {s.count}
              {s.accepted ? ` · ждут ${s.accepted}` : ""}
              {s.late ? ` · с просрочкой ${s.late}` : ""}
              {s.done ? ` · в среднем ${fmtScore(s.meanPoints)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the student leaves on the table: labs accepted without the theory,
 * and the letter the points would bring.
 */
export function PendingTheory({
  labs,
  total,
  max,
  className,
}: {
  labs: GradeLabs;
  total: number;
  max: number;
  className?: string;
}) {
  const t = labTotals(labs);
  if (t.accepted === 0) return null;
  const now = letterFor(total, max);
  const then = letterFor(total + t.pending, max);
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-pretty text-amber-900 dark:text-amber-200",
        className,
      )}
    >
      <HourglassIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {t.accepted} {plural(t.accepted, "лаба ждёт", "лабы ждут", "лаб ждут")}{" "}
        теормина. Это зачёт, пересдавать можно сколько угодно
        {t.pending > 0
          ? `: сдадите — плюс ${fmtScore(t.pending)}${then !== now ? `, и это уже ${then}` : ""}`
          : ""}
        .
      </span>
    </p>
  );
}

type PlusRow = GradeEntry & { key: number };

/**
 * Rating by pluses: who brought the most extra to their labs. Only those
 * with at least one plus; the bonus is what pluses and minuses gave in
 * points, so the tie-break favours the one who keeps them.
 */
export function PlusBoard({
  rows,
  myGroup,
  grouped,
}: {
  rows: PlusRow[];
  myGroup: string;
  grouped: boolean;
}) {
  const ranked = rows
    .map((r) => ({ ...r, t: labTotals(r.labs) }))
    .filter((r) => r.t.plus > 0)
    .sort(
      (a, b) =>
        b.t.plus - a.t.plus ||
        b.t.bonus - a.t.bonus ||
        a.name.localeCompare(b.name, "ru"),
    );
  let place = 0;
  let prev = Number.NaN;
  const placed = ranked.map((r, i) => {
    if (r.t.plus !== prev) {
      place = i + 1;
      prev = r.t.plus;
    }
    return { ...r, rank: place };
  });
  const me = rows.find((r) => r.me);
  const mine = me ? labTotals(me.labs) : null;

  // Групповой зачёт: сумма плюсиков группы.
  const byGroup = new Map<string, number>();
  for (const r of ranked)
    byGroup.set(r.group, (byGroup.get(r.group) ?? 0) + r.t.plus);
  const groups = [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, 5);

  if (placed.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        Плюсиков пока ни у кого нет.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground text-pretty">
        Плюсик — за то, что сделано сверх задания: он добавляет процент к лабе,
        минус столько же отнимает. Здесь все, у кого есть хотя бы один плюсик, —{" "}
        {placed.length}{" "}
        {plural(placed.length, "человек", "человека", "человек")}.
        {mine && mine.plus === 0 ? " У вас пока ни одного." : ""}
      </p>
      {grouped && groups.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {groups.map(([g, n], i) => (
            <span
              key={g}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
                g === myGroup && "border-primary/40 bg-primary/5 font-medium",
              )}
            >
              {MEDALS[i] ?? `${i + 1}.`}
              <GroupBadge group={g} />
              {g}
              <span className="tabular-nums text-muted-foreground">
                +{fmtScore(n)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      <ol className="divide-y overflow-hidden rounded-xl border bg-card">
        {placed.map((r) => (
          <li
            key={r.key}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 sm:px-4",
              r.me && "bg-primary/5 font-medium",
            )}
          >
            <span className="w-8 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
              {MEDALS[r.rank - 1] ?? r.rank}
            </span>
            <UserAvatar
              name={r.name}
              photoUrl={r.user?.photoUrl}
              size="sm"
              className={cn(!r.user && "opacity-60")}
            />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate text-sm">{r.name}</span>
              <GroupBadge group={r.group} />
              {r.me ? (
                <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  вы
                </span>
              ) : null}
            </span>
            {r.t.minus ? (
              <span
                className="hidden shrink-0 text-xs tabular-nums text-rose-600 sm:inline dark:text-rose-400"
                title="Минусы"
              >
                −{fmtScore(r.t.minus)}
              </span>
            ) : null}
            <span
              className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline"
              title="Сколько баллов дали плюсы и минусы"
            >
              {fmtDelta(r.t.bonus)} б.
            </span>
            <span
              className="flex w-24 shrink-0 items-center justify-end gap-1 text-sm font-semibold tabular-nums"
              title={fmtCount(r.t.plus, "плюсик", "плюсика", "плюсиков")}
            >
              <SparklesIcon
                className="size-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              {fmtScore(r.t.plus)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
