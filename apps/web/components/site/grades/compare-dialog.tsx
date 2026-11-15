"use client";

import { ArrowDownIcon, ArrowUpIcon, EqualIcon, UsersIcon } from "lucide-react";
import { useRef, useState } from "react";

import {
  ComboboxField,
  type ComboOption,
} from "@/components/admin/combobox-field";
import {
  bothEmpty,
  deltaTone,
  Highlights,
  PairBars,
  PartsBreakdown,
} from "@/components/site/grades/compare-parts";
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
import { Spinner } from "@/components/ui/spinner";
import type {
  GradeEntry,
  GradeLabs,
  GradeParts,
  GradeSourceSummary,
  GradesResponse,
} from "@/lib/api/types";
import { plural } from "@/lib/format";
import {
  averageParts,
  diffParts,
  findStudent,
  fmtDelta,
  fmtScore,
  mean,
  type PartDiff,
  type RankedEntry,
  rank,
} from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

/** One side of a comparison: a student or an average over a scope. */
export type Contender = {
  name: string;
  /** Empty for averages. */
  group: string;
  total: number;
  parts: GradeParts;
  /** Empty for averages. */
  labs: GradeLabs;
  /** Place among `size` people; null for averages. */
  rank: number | null;
  photoUrl?: string;
  average: boolean;
};

/** Whom to compare with: a student from the sheet or an average over a scope. */
export type Opponent = Contender & {
  /** `row:<index in the response>` or `avg:group` / `avg:course`. */
  id: string;
  /** Account, to find the same student in another sheet. */
  userId?: number;
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
    labs: {},
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
      labs: r.labs,
      rank: r.rank,
      photoUrl: r.user?.photoUrl,
      userId: r.user?.id,
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
  letters,
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
  /** No letter grade for a sum over several subjects. */
  letters: boolean;
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
        {letters ? <LetterChip total={total} max={max} /> : null}
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

function Summary({ diffs, total }: { diffs: PartDiff[]; total: number }) {
  // Столбцы, где баллов пока нет ни у кого, в счёт не идут.
  const both = diffs.filter(
    (d): d is PartDiff & { delta: number } => d.delta != null && !bothEmpty(d),
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

/** Another sheet as the comparison sees it: loaded, on its way or failed. */
export type Sheet = GradesResponse | "loading" | "error";

/** Both sides within one sheet, places among `size` people. */
type View = {
  source: GradeSourceSummary;
  me: Contender;
  other: Contender;
  size: number;
};

function contender(r: RankedEntry): Contender {
  return {
    name: r.name,
    group: r.group,
    total: r.total,
    parts: r.parts,
    labs: r.labs,
    rank: r.rank,
    photoUrl: r.user?.photoUrl,
    average: false,
  };
}

/**
 * The same comparison in another subject's sheet: me, the same student (or
 * the same kind of average) and places among the same people — the stream's
 * groups for a stream rating. Null when one of us is not in that sheet.
 */
function viewIn(
  sheet: GradesResponse,
  other: Opponent,
  groups: Set<string> | null,
  myGroup: string,
): View | null {
  const source = sheet.source;
  if (!source) return null;
  const people = rank(
    groups ? sheet.rows.filter((r) => groups.has(r.group)) : sheet.rows,
  );
  const me = people.find((r) => r.me);
  if (!me) return null;
  let them: Contender | null = null;
  if (other.average) {
    const rows =
      other.id === "avg:group"
        ? people.filter((r) => r.group === myGroup)
        : people;
    if (rows.length) {
      them = {
        ...other,
        total: mean(rows.map((r) => r.total)),
        parts: averageParts(rows, source.columns),
        labs: {},
      };
    }
  } else {
    const row = findStudent(people, other);
    if (row) {
      them = contender(row);
      them.photoUrl ??= other.photoUrl;
    }
  }
  return (
    them && { source, me: contender(me), other: them, size: people.length }
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
  sources,
  sheets,
  course,
  myGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: Ranked;
  opponentId: string | null;
  onOpponentChange: (id: string) => void;
  opponents: Opponent[];
  picks: { id: string; label: string }[];
  /** The sheet the rating is open on. */
  source: GradeSourceSummary;
  /** Every sheet the viewer sees: the other subjects to compare in. */
  sources: GradeSourceSummary[];
  sheets: Record<number, Sheet>;
  course: Ranked[];
  myGroup: string;
}) {
  // Фокус не в поле поиска: на телефоне иначе сразу вылезает клавиатура.
  const focusRef = useRef<HTMLDivElement>(null);
  const [subjectId, setSubjectId] = useState(source.id);
  const other = opponents.find((o) => o.id === opponentId) ?? null;
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

  // Предметы: открытый рейтинг первым, дальше остальные таблицы, где есть оба.
  // У сводного рейтинга потока места в предмете — среди того же потока.
  const groups = source.stream ? new Set(course.map((r) => r.group)) : null;
  const order = (s: GradeSourceSummary) => {
    const i = source.columns.findIndex((c) => c.sourceId === s.id);
    return i < 0 ? source.columns.length : i;
  };
  const current: View | null = other
    ? { source, me: contender(me), other, size: course.length }
    : null;
  const subjects = [
    {
      id: source.id,
      label: source.stream ? "Сумма" : source.title,
      color: source.subjectColor,
      view: current as View | "loading" | null,
    },
    ...sources
      .filter((s) => s.id !== source.id && !s.stream)
      .sort((a, b) => order(a) - order(b))
      .map((s) => {
        const sheet = sheets[s.id];
        return {
          id: s.id,
          label:
            source.columns.find((c) => c.sourceId === s.id)?.label ?? s.title,
          color: s.subjectColor,
          view:
            !other || sheet === "error"
              ? null
              : sheet === undefined || sheet === "loading"
                ? ("loading" as const)
                : viewIn(sheet, other, groups, myGroup),
        };
      }),
  ].filter((s) => s.view != null);
  const picked = subjects.find((s) => s.id === subjectId)?.view;
  const view = picked && picked !== "loading" ? picked : current;
  const activeId = view === current ? source.id : subjectId;
  const openSubject = (id: number | undefined) => {
    const s = subjects.find((x) => x.id === id);
    return s && s.view !== "loading" ? () => setSubjectId(s.id) : undefined;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl" initialFocus={focusRef}>
        <DialogHeader>
          <DialogTitle>Сравнение баллов</DialogTitle>
          <DialogDescription>
            {(view?.source ?? source).title}
            {view?.source.stream
              ? ": суммы по предметам. Выберите предмет, чтобы сравнить каждый тест и лабу."
              : ": ваши баллы рядом с чужими по каждому столбцу таблицы."}
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

        {subjects.length > 1 ? (
          <fieldset
            aria-label="Предмет"
            className="flex min-w-0 flex-wrap gap-1 rounded-lg border-0 bg-muted p-1"
          >
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === activeId}
                disabled={s.view === "loading"}
                onClick={() => setSubjectId(s.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50",
                  s.id === activeId &&
                    "bg-background text-foreground shadow-sm dark:bg-input/30",
                )}
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    subjectColor(s.color).dot,
                  )}
                  aria-hidden
                />
                {s.label}
                {s.view === "loading" ? <Spinner /> : null}
              </button>
            ))}
          </fieldset>
        ) : null}

        {view ? (
          <Comparison view={view} onOpen={openSubject} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Выберите, с кем сравнить.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Comparison({
  view,
  onOpen,
}: {
  view: View;
  /** Opens a subject of a stream rating; undefined when there is none. */
  onOpen: (sourceId: number | undefined) => (() => void) | undefined;
}) {
  const { source, me, other, size } = view;
  const color = subjectColor(source.subjectColor).dot;
  const letters = !source.stream;
  const diffs = diffParts(source.columns, me.parts, other.parts);
  const total = me.total - other.total;
  const surname = other.name.split(" ")[0];
  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-card p-4">
        <Side
          you
          name={me.name}
          group={me.group}
          photoUrl={me.photoUrl}
          total={me.total}
          max={source.maxTotal}
          rank={me.rank}
          courseSize={size}
          align="start"
          letters={letters}
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
          courseSize={size}
          align="end"
          average={other.average}
          letters={letters}
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

      {diffs.length >= 4 ? (
        <Highlights
          diffs={diffs}
          otherTitle={
            other.average ? "Где выше среднее" : `Где сильнее ${surname}`
          }
        />
      ) : null}

      {diffs.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {source.stream ? "По предметам" : "По столбцам"}
            </h3>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-3 rounded-full", color)} />
                вы
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-3 rounded-full bg-foreground/35" />
                {other.average ? "среднее" : surname}
              </span>
            </span>
          </div>
          <PartsBreakdown
            diffs={diffs}
            color={color}
            otherLabel={other.average ? "среднее" : surname}
            mineLabs={me.labs}
            theirLabs={other.labs}
            onOpen={(d) => onOpen(d.column.sourceId)}
          />
        </section>
      ) : null}
    </>
  );
}
