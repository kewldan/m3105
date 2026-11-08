"use client";

import { ArrowDownIcon, ArrowUpIcon, EqualIcon, UsersIcon } from "lucide-react";
import { useRef } from "react";

import {
  ComboboxField,
  type ComboOption,
} from "@/components/admin/combobox-field";
import { LetterChip } from "@/components/site/grades/letter-chip";
import { GroupBadge } from "@/components/site/group-badge";
import { UserAvatar } from "@/components/site/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  GradeEntry,
  GradeParts,
  GradeSourceSummary,
} from "@/lib/api/types";
import { plural } from "@/lib/format";
import {
  averageParts,
  diffParts,
  fmtDelta,
  fmtScore,
  mean,
  type PartDiff,
  percent,
  type RankedEntry,
} from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

/** Whom to compare with: a student from the sheet or an average over a scope. */
export type Opponent = {
  /** `row:<index in the response>` or `avg:group` / `avg:course`. */
  id: string;
  name: string;
  /** Empty for averages. */
  group: string;
  total: number;
  parts: GradeParts;
  /** Place on the course (in the sheet); null for averages. */
  rank: number | null;
  photoUrl?: string;
  average: boolean;
};

type Ranked = RankedEntry & { key: number };

/** Averages first, then everyone else in the course order. */
export function buildOpponents({
  course,
  group,
  myGroup,
  grouped,
  source,
}: {
  course: Ranked[];
  /** My study group's rows; empty when I'm not in one. */
  group: GradeEntry[];
  myGroup: string;
  grouped: boolean;
  source: GradeSourceSummary;
}): Opponent[] {
  const avg = (id: string, name: string, rows: GradeEntry[]): Opponent => ({
    id,
    name,
    group: "",
    total: mean(rows.map((r) => r.total)),
    parts: averageParts(rows, source.columns),
    rank: null,
    average: true,
  });
  const list: Opponent[] = [];
  if (grouped && group.length > 1) {
    list.push(avg("avg:group", `Среднее по группе ${myGroup}`, group));
  }
  list.push(
    avg(
      "avg:course",
      grouped ? "Среднее по курсу" : "Среднее по таблице",
      course,
    ),
  );
  for (const r of course) {
    if (r.me) continue;
    list.push({
      id: `row:${r.key}`,
      name: r.name,
      group: r.group,
      total: r.total,
      parts: r.parts,
      rank: r.rank,
      photoUrl: r.user?.photoUrl,
      average: false,
    });
  }
  return list;
}

/** Ready-made picks: neighbours in the rating, leaders and averages. */
export function quickPicks({
  me,
  course,
  group,
  grouped,
}: {
  me: Ranked;
  course: Ranked[];
  group: Ranked[];
  grouped: boolean;
}): { id: string; label: string }[] {
  // Курс отсортирован по убыванию: с конца первый, кто выше, — ближайший.
  const ahead = [...course].reverse().find((r) => r.total > me.total);
  const behind = course.find((r) => r.total < me.total);
  const groupTop = group.find((r) => !r.me);
  const courseTop = course.find((r) => !r.me);
  const picks = [
    ahead && { id: `row:${ahead.key}`, label: "Ближайший выше" },
    behind && { id: `row:${behind.key}`, label: "Ближайший ниже" },
    grouped &&
      groupTop &&
      groupTop.total >= me.total && {
        id: `row:${groupTop.key}`,
        label: "Лидер группы",
      },
    courseTop &&
      courseTop.total >= me.total && {
        id: `row:${courseTop.key}`,
        label: grouped ? "Лидер курса" : "Лидер таблицы",
      },
    grouped &&
      group.length > 1 && { id: "avg:group", label: "Среднее по группе" },
    { id: "avg:course", label: grouped ? "Среднее по курсу" : "Среднее" },
  ].filter((p): p is { id: string; label: string } => Boolean(p));
  // Лидер группы может оказаться и ближайшим выше: одна кнопка на человека.
  const seen = new Set<string>();
  return picks.filter((p) => !seen.has(p.id) && seen.add(p.id));
}

function deltaTone(v: number | null): string {
  if (v == null || Math.abs(v) < 0.005) return "text-muted-foreground";
  return v > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
}

function Side({
  name,
  group,
  photoUrl,
  total,
  max,
  rank,
  courseSize,
  align,
  you,
  average,
}: {
  name: string;
  group: string;
  photoUrl?: string;
  total: number;
  max: number;
  rank: number | null;
  courseSize: number;
  align: "start" | "end";
  you?: boolean;
  average?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        align === "end" ? "items-end text-right" : "items-start",
      )}
    >
      {average ? (
        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UsersIcon className="size-4" aria-hidden />
        </span>
      ) : (
        <UserAvatar name={name} photoUrl={photoUrl} />
      )}
      <div
        className={cn(
          "flex min-w-0 max-w-full items-center gap-1.5",
          align === "end" && "flex-row-reverse",
        )}
      >
        <span className="truncate text-sm font-medium">
          {you ? "Вы" : name}
        </span>
        {group ? <GroupBadge group={group} /> : null}
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5",
          align === "end" && "flex-row-reverse",
        )}
      >
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {fmtScore(total)}
        </span>
        <LetterChip total={total} max={max} />
      </div>
      <span className="text-xs text-muted-foreground">
        {rank
          ? `${rank} место из ${courseSize}`
          : average
            ? "средний балл"
            : ""}
      </span>
    </div>
  );
}

/** Two bars on one scale: mine in the subject colour, theirs neutral. */
function PairBars({
  mine,
  theirs,
  max,
  color,
}: {
  mine: number | null | undefined;
  theirs: number | null | undefined;
  max: number;
  color: string;
}) {
  const bar = (v: number | null | undefined, tone: string) => (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone,
        )}
        style={{ width: `${v == null ? 0 : percent(v, max)}%` }}
      />
    </div>
  );
  return (
    <div className="space-y-1" aria-hidden>
      {bar(mine, color)}
      {bar(theirs, "bg-foreground/35")}
    </div>
  );
}

function PartRow({ d, color }: { d: PartDiff; color: string }) {
  const { column, mine, theirs, delta } = d;
  // Без известного максимума шкала — больший из двух баллов.
  const scale =
    column.max > 0 ? column.max : Math.max(mine ?? 0, theirs ?? 0, 1);
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-xs text-muted-foreground">
        {column.label}
        {column.max > 0 ? ` · из ${fmtScore(column.max)}` : ""}
      </span>
      <span
        className={cn(
          "text-right text-xs font-semibold tabular-nums",
          deltaTone(delta),
        )}
      >
        {delta == null ? "нет у одного" : fmtDelta(delta)}
      </span>
      <PairBars mine={mine} theirs={theirs} max={scale} color={color} />
      <span className="w-20 text-right text-xs tabular-nums">
        <span className="font-medium">
          {mine === undefined ? "нет" : fmtScore(mine)}
        </span>
        <span className="text-muted-foreground">
          {" "}
          / {theirs === undefined ? "нет" : fmtScore(theirs)}
        </span>
      </span>
    </li>
  );
}

function Summary({ diffs, total }: { diffs: PartDiff[]; total: number }) {
  const both = diffs.filter(
    (d): d is PartDiff & { delta: number } => d.delta != null,
  );
  const ahead = both.filter((d) => d.delta > 0.005);
  const behind = both.filter((d) => d.delta < -0.005);
  const worst = behind.reduce<(typeof behind)[number] | null>(
    (w, d) => (w == null || d.delta < w.delta ? d : w),
    null,
  );
  const best = ahead.reduce<(typeof ahead)[number] | null>(
    (b, d) => (b == null || d.delta > b.delta ? d : b),
    null,
  );
  const parts: string[] = [];
  parts.push(
    Math.abs(total) < 0.005
      ? "По сумме вы вровень."
      : total > 0
        ? `По сумме вы впереди на ${fmtScore(total)}.`
        : `По сумме вы отстаёте на ${fmtScore(-total)}.`,
  );
  if (both.length > 1) {
    const where = (n: number) =>
      `${n} ${plural(n, "столбце", "столбцах", "столбцах")}`;
    parts.push(
      ahead.length === 0 && behind.length === 0
        ? "По столбцам — вровень."
        : ahead.length === 0
          ? `Позади в ${where(behind.length)} из ${both.length}.`
          : behind.length === 0
            ? `Впереди в ${where(ahead.length)} из ${both.length} и нигде не уступаете.`
            : `Впереди в ${where(ahead.length)} из ${both.length}, позади — в ${behind.length}.`,
    );
  }
  if (best) {
    parts.push(
      `Сильнее всего — «${best.column.label}» (${fmtDelta(best.delta)}).`,
    );
  }
  if (worst) {
    parts.push(
      `Больше всего уступаете в «${worst.column.label}» (${fmtDelta(worst.delta)}).`,
    );
  }
  return (
    <p className="text-sm text-muted-foreground text-pretty">
      {parts.join(" ")}
    </p>
  );
}

/** Side-by-side comparison of my row with another student or an average. */
export function CompareDialog({
  open,
  onOpenChange,
  me,
  opponentId,
  onOpponentChange,
  opponents,
  picks,
  source,
  courseSize,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: Ranked;
  opponentId: string | null;
  onOpponentChange: (id: string) => void;
  opponents: Opponent[];
  picks: { id: string; label: string }[];
  source: GradeSourceSummary;
  courseSize: number;
}) {
  // Фокус не в поле поиска: на телефоне иначе сразу вылезает клавиатура.
  const focusRef = useRef<HTMLDivElement>(null);
  const other = opponents.find((o) => o.id === opponentId) ?? null;
  const color = subjectColor(source.subjectColor).dot;
  const options: ComboOption[] = opponents.map((o) => ({
    value: o.id,
    label: o.group ? `${o.name} ${o.group}` : o.name,
    render: (
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {o.rank ?? "∑"}
        </span>
        <span className="truncate">{o.name}</span>
        {o.group ? <GroupBadge group={o.group} /> : null}
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmtScore(o.total)}
        </span>
      </span>
    ),
  }));
  const diffs = other ? diffParts(source.columns, me.parts, other.parts) : [];
  const total = other ? me.total - other.total : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl" initialFocus={focusRef}>
        <DialogHeader>
          <DialogTitle>Сравнение баллов</DialogTitle>
          <DialogDescription>
            {source.title}: ваши баллы рядом с чужими по каждому столбцу
            таблицы.
          </DialogDescription>
        </DialogHeader>

        <div ref={focusRef} tabIndex={-1} className="space-y-2 outline-none">
          <ComboboxField
            options={options}
            value={opponentId}
            onChange={(id) => id && onOpponentChange(id)}
            placeholder="Фамилия или группа"
            emptyText="Никого не нашлось"
          />
          {picks.length ? (
            <div className="flex flex-wrap gap-1.5">
              {picks.map((p) => (
                <Button
                  key={p.id}
                  size="xs"
                  variant={p.id === opponentId ? "default" : "outline"}
                  onClick={() => onOpponentChange(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {other ? (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-card p-4">
              <Side
                you
                name={me.name}
                group={me.group}
                photoUrl={me.user?.photoUrl}
                total={me.total}
                max={source.maxTotal}
                rank={me.rank}
                courseSize={courseSize}
                align="start"
              />
              <div
                className={cn(
                  "flex flex-col items-center gap-0.5 px-1",
                  deltaTone(total),
                )}
              >
                {Math.abs(total) < 0.005 ? (
                  <EqualIcon className="size-5" aria-hidden />
                ) : total > 0 ? (
                  <ArrowUpIcon className="size-5" aria-hidden />
                ) : (
                  <ArrowDownIcon className="size-5" aria-hidden />
                )}
                <span className="text-lg font-semibold tabular-nums">
                  {fmtDelta(total)}
                </span>
              </div>
              <Side
                name={other.name}
                group={other.group}
                photoUrl={other.photoUrl}
                total={other.total}
                max={source.maxTotal}
                rank={other.rank}
                courseSize={courseSize}
                align="end"
                average={other.average}
              />
              <div className="col-span-3 pt-2">
                <PairBars
                  mine={me.total}
                  theirs={other.total}
                  max={source.maxTotal}
                  color={color}
                />
              </div>
            </div>

            <Summary diffs={diffs} total={total} />

            {diffs.length ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">По столбцам</h3>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-3 rounded-full", color)} />
                      вы
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-3 rounded-full bg-foreground/35" />
                      {other.average ? "среднее" : other.name.split(" ")[0]}
                    </span>
                  </span>
                </div>
                <ul className="space-y-3">
                  {diffs.map((d) => (
                    <PartRow key={d.column.key} d={d} color={color} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Выберите, с кем сравнить.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
