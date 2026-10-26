import type { GradeEntry } from "@/lib/api/types";

/** ITMO letter grades: the lowest score (out of 100) for each letter. */
export const LETTERS = [
  { letter: "A", min: 91, label: "отлично" },
  { letter: "B", min: 84, label: "очень хорошо" },
  { letter: "C", min: 74, label: "хорошо" },
  { letter: "D", min: 68, label: "удовлетворительно" },
  { letter: "E", min: 60, label: "посредственно" },
] as const;

export type Letter = (typeof LETTERS)[number]["letter"] | "F";

/** Percent of the maximum, 0–100. */
export function percent(total: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (total / max) * 100));
}

export function letterFor(total: number, max: number): Letter {
  const p = percent(total, max);
  return LETTERS.find((l) => p >= l.min)?.letter ?? "F";
}

/** Points left to the next letter, or null at A. */
export function toNextLetter(
  total: number,
  max: number,
): { letter: Letter; points: number } | null {
  const p = percent(total, max);
  const next = [...LETTERS].reverse().find((l) => p < l.min);
  if (!next) return null;
  return {
    letter: next.letter,
    points: Math.max(0, (next.min / 100) * max - total),
  };
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
