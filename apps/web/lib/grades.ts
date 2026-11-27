import type {
  GradeColumn,
  GradeEntry,
  GradeLabs,
  GradeParts,
} from "@/lib/api/types";
import { plural } from "@/lib/format";

/**
 * ITMO grading scale, out of 100: the letter, its five-point grade and the
 * lower bound. A–D need strictly more than `min` (90,5 is already A), E
 * starts at 60 inclusive.
 */
export const LETTERS = [
  { letter: "A", grade: 5, min: 90, strict: true, label: "отлично" },
  { letter: "B", grade: 4, min: 83, strict: true, label: "хорошо" },
  { letter: "C", grade: 4, min: 74, strict: true, label: "хорошо" },
  { letter: "D", grade: 3, min: 67, strict: true, label: "удовлетворительно" },
  { letter: "E", grade: 3, min: 60, strict: false, label: "удовлетворительно" },
] as const;

export type Letter = (typeof LETTERS)[number]["letter"] | "F";

/** Percent of the maximum, 0–100. */
export function percent(total: number, max: number): number {
  if (max <= 0) return 0;
  // Rounding keeps 18,9 of 21 at exactly 90%, not a hair above it.
  const p = Math.round((total / max) * 100 * 1e6) / 1e6;
  return Math.max(0, Math.min(100, p));
}

function reaches(p: number, l: { min: number; strict: boolean }): boolean {
  return l.strict ? p > l.min : p >= l.min;
}

export function letterFor(total: number, max: number): Letter {
  const p = percent(total, max);
  return LETTERS.find((l) => reaches(p, l))?.letter ?? "F";
}

/** «D3»: the letter with its five-point grade; F has none. */
export function withGrade(letter: Letter): string {
  const l = LETTERS.find((x) => x.letter === letter);
  return l ? `${l.letter}${l.grade}` : letter;
}

/** Pass-fail subjects (English, ИСРПО): no letters, 60% of the maximum is a pass. */
export const PASS_MIN = 60;

export function passed(total: number, max: number): boolean {
  return percent(total, max) >= PASS_MIN;
}

/** «D3», or for a pass-fail subject «зачёт» / «незачёт». */
export function markFor(total: number, max: number, passFail: boolean): string {
  if (!passFail) return withGrade(letterFor(total, max));
  return passed(total, max) ? "зачёт" : "незачёт";
}

/**
 * Points left to the next mark («C4»), or null at A. A strict bound needs a
 * hundredth more than the bound itself: scores come with two decimals. For a
 * pass-fail subject the only step is the pass: `letter` is then «зачёта»
 * («до зачёта»).
 */
export function toNextLetter(
  total: number,
  max: number,
  passFail = false,
): { letter: string; points: number } | null {
  const p = percent(total, max);
  const next = passFail
    ? p < PASS_MIN
      ? { letter: "зачёта", min: PASS_MIN, strict: false }
      : undefined
    : [...LETTERS]
        .reverse()
        .filter((l) => !reaches(p, l))
        .map((l) => ({ ...l, letter: withGrade(l.letter) }))[0];
  if (!next) return null;
  const points = (next.min / 100) * max - total + (next.strict ? 0.01 : 0);
  return { letter: next.letter, points: Math.max(0.01, points) };
}

/** Thresholds drawn on the distribution: letters, or the single pass line. */
export function thresholds(
  passFail: boolean,
): readonly { letter: string; min: number }[] {
  return passFail ? [{ letter: "зачёт", min: PASS_MIN }] : LETTERS;
}

/** Tailwind classes for a letter chip; F is neutral, A is the brightest. */
export const LETTER_TONE: Record<Letter, string> = {
  A: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  B: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  C: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  D: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  E: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  F: "bg-muted text-muted-foreground",
};

/** 11.04 → "11,04", 12 → "12". */
export function fmtScore(v: number | null | undefined): string {
  if (v == null) return "—";
  return (Math.round(v * 100) / 100).toLocaleString("ru-RU", {
    maximumFractionDigits: 2,
  });
}

export type RankedEntry = GradeEntry & { rank: number };

/** Competition ranking ("1, 2, 2, 4") over rows sorted best first. */
export function rank<T extends GradeEntry>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru"),
  );
  let prev = Number.NaN;
  let place = 0;
  return sorted.map((r, i) => {
    if (r.total !== prev) {
      place = i + 1;
      prev = r.total;
    }
    return { ...r, rank: place };
  });
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : 0;
}

/** Counts of totals in `buckets` equal ranges from 0 to max. */
export function histogram(
  values: number[],
  max: number,
  buckets: number,
): number[] {
  const out = new Array<number>(buckets).fill(0);
  const width = max / buckets;
  for (const v of values) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor(v / width)));
    out[i]++;
  }
  return out;
}

export type GroupStat = {
  group: string;
  count: number;
  mean: number;
  median: number;
  best: number;
  /** Share of students with a passing score (E or better), 0–1. */
  passing: number;
};

export function groupStats(rows: GradeEntry[], max: number): GroupStat[] {
  const byGroup = new Map<string, number[]>();
  for (const r of rows) {
    const list = byGroup.get(r.group) ?? [];
    list.push(r.total);
    byGroup.set(r.group, list);
  }
  return [...byGroup.entries()]
    .map(([group, totals]) => ({
      group,
      count: totals.length,
      mean: mean(totals),
      median: median(totals),
      best: Math.max(...totals),
      passing:
        totals.filter((t) => letterFor(t, max) !== "F").length / totals.length,
    }))
    .sort((a, b) => b.mean - a.mean || a.group.localeCompare(b.group, "ru"));
}

/**
 * Per-column mean over the rows that have the column at all (another stream's
 * tab may lack it); an empty cell counts as zero, as it does in the total.
 */
export function averageParts(
  rows: GradeEntry[],
  columns: GradeColumn[],
): GradeParts {
  const out: GradeParts = {};
  for (const col of columns) {
    const values = rows
      .filter((r) => col.key in r.parts)
      .map((r) => r.parts[col.key] ?? 0);
    if (values.length) out[col.key] = mean(values);
  }
  return out;
}

export type PartDiff = {
  column: GradeColumn;
  /** undefined — no such column on the tab, null — empty cell. */
  mine: number | null | undefined;
  theirs: number | null | undefined;
  /** mine − theirs; null when one side has no such column. */
  delta: number | null;
};

/** Column-by-column comparison; columns absent on both sides are skipped. */
export function diffParts(
  columns: GradeColumn[],
  mine: GradeParts,
  theirs: GradeParts,
): PartDiff[] {
  return columns
    .filter((col) => col.key in mine || col.key in theirs)
    .map((column) => {
      const a = column.key in mine ? mine[column.key] : undefined;
      const b = column.key in theirs ? theirs[column.key] : undefined;
      return {
        column,
        mine: a,
        theirs: b,
        delta: a === undefined || b === undefined ? null : (a ?? 0) - (b ?? 0),
      };
    });
}

/** Signed score: «+1,5», «−2», «0». */
export function fmtDelta(v: number): string {
  // Округляем модуль, как fmtScore: иначе −5,625 станет «−5,62», а 5,625 — «5,63».
  const r = Math.round(Math.abs(v) * 100) / 100;
  if (r === 0) return "0";
  return `${v > 0 ? "+" : "−"}${fmtScore(r)}`;
}

/** Lab columns of the source: those that have a lab block in some row. */
export function labColumns(
  columns: GradeColumn[],
  rows: { labs: GradeLabs }[],
): GradeColumn[] {
  return columns.filter((c) => rows.some((r) => c.key in r.labs));
}

export type LabTotals = {
  done: number;
  /** Accepted labs waiting for the theory. */
  accepted: number;
  /** What the pending labs give once their theory mins are passed. */
  pending: number;
  plus: number;
  minus: number;
  /** Points pluses and minuses added, signed. */
  bonus: number;
  lateLoss: number;
};

/** Sums one student's labs. */
export function labTotals(labs: GradeLabs): LabTotals {
  const out: LabTotals = {
    done: 0,
    accepted: 0,
    pending: 0,
    plus: 0,
    minus: 0,
    bonus: 0,
    lateLoss: 0,
  };
  for (const l of Object.values(labs)) {
    if (l.status === "done") out.done++;
    if (l.status === "accepted") {
      out.accepted++;
      out.pending += l.potential ?? 0;
    }
    out.plus += l.plus ?? 0;
    out.minus += l.minus ?? 0;
    out.bonus += l.bonus ?? 0;
    out.lateLoss += l.lateLoss ?? 0;
  }
  return out;
}

export type LabStat = {
  column: GradeColumn;
  /** Rows that have this lab at all. */
  count: number;
  done: number;
  accepted: number;
  /** Labs accepted or done after the deadline. */
  late: number;
  /** Mean points over done labs. */
  meanPoints: number;
};

/** How the rows did on each lab. */
export function labStats(
  rows: { labs: GradeLabs; parts: GradeParts }[],
  columns: GradeColumn[],
): LabStat[] {
  return columns.map((column) => {
    const labs = rows.flatMap((r) => {
      const l = r.labs[column.key];
      return l ? [{ lab: l, points: r.parts[column.key] ?? 0 }] : [];
    });
    const done = labs.filter((x) => x.lab.status === "done");
    return {
      column,
      count: labs.length,
      done: done.length,
      accepted: labs.filter((x) => x.lab.status === "accepted").length,
      late: labs.filter((x) => (x.lab.stage ?? 0) > 0).length,
      meanPoints: mean(done.map((x) => x.points)),
    };
  });
}

/** «1 плюсик», «1,5 плюсика»: a fraction takes the genitive singular. */
export function fmtCount(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return `${fmtScore(n)} ${Number.isInteger(n) ? plural(n, one, few, many) : few}`;
}

// «Тест» → «Тесты»: названия групп столбцов; что не знаем — как есть.
const GROUP_NAMES: Record<string, string> = {
  тест: "Тесты",
  лаба: "Лабы",
  лр: "Лабы",
  дз: "ДЗ",
  теормин: "Теормины",
  коллоквиум: "Коллоквиумы",
  кр: "Контрольные",
  контрольная: "Контрольные",
};

export type ColumnGroup = {
  /** «Тесты» for a group, the column's own label for a single column. */
  label: string;
  columns: GradeColumn[];
};

/**
 * Columns grouped by their label without the trailing number («Тест 1»,
 * «Тест 2» → «Тесты»), in the order of first appearance.
 */
export function groupColumns(columns: GradeColumn[]): ColumnGroup[] {
  const groups = new Map<string, GradeColumn[]>();
  for (const c of columns) {
    const stem = c.label
      .replace(/\s*№?\s*\d+$/, "")
      .trim()
      .toLowerCase();
    const list = groups.get(stem || c.key) ?? [];
    list.push(c);
    groups.set(stem || c.key, list);
  }
  return [...groups.entries()].map(([stem, cols]) => ({
    label:
      cols.length > 1
        ? (GROUP_NAMES[stem] ?? stem.charAt(0).toUpperCase() + stem.slice(1))
        : cols[0].label,
    columns: cols,
  }));
}

/** The same student in another sheet: by account, else by name and group. */
export function findStudent<T extends GradeEntry>(
  rows: T[],
  who: { name: string; group: string; userId?: number },
): T | null {
  if (who.userId != null) {
    const byUser = rows.filter((r) => r.user?.id === who.userId);
    if (byUser.length === 1) return byUser[0];
  }
  const byName = rows.filter(
    (r) => r.name === who.name && r.group === who.group,
  );
  // Тёзки в одной группе: лучше не сравнивать, чем сравнить не с тем.
  return byName.length === 1 ? byName[0] : null;
}
