import { ChevronRightIcon } from "lucide-react";

import type { GradeLab, GradeLabs } from "@/lib/api/types";
import {
  fmtDelta,
  fmtScore,
  groupColumns,
  type PartDiff,
  percent,
} from "@/lib/grades";
import { cn } from "@/lib/utils";

/** Below this a difference is rounding noise. */
const EPS = 0.005;

export function deltaTone(v: number | null): string {
  if (v == null || Math.abs(v) < EPS) return "text-muted-foreground";
  return v > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-rose-700 dark:text-rose-300";
}

/** No points on either side yet: an empty cell or a zero. */
export function bothEmpty(d: PartDiff): boolean {
  return !d.mine && !d.theirs;
}

/** Two bars on one scale: mine in the subject colour, theirs neutral. */
export function PairBars({
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

/** «сдана в срок, плюсики +5 −1», «ждёт теормина, на кону 12». */
function labText(lab: GradeLab): string {
  if (lab.status === "none") return "не сдана";
  if (lab.status === "accepted") {
    return lab.potential != null
      ? `ждёт теормина, на кону ${fmtScore(lab.potential)}`
      : "ждёт теормина";
  }
  const out = [
    (lab.stage ?? 0) > 0
      ? `сдана с просрочкой ×${fmtScore(lab.factor)}`
      : "сдана в срок",
  ];
  if (lab.plus) out.push(`плюсики +${fmtScore(lab.plus)}`);
  if (lab.minus) out.push(`минусы −${fmtScore(lab.minus)}`);
  return out.join(", ");
}

type LabPair = { mine?: GradeLab; theirs?: GradeLab };

function PartRow({
  d,
  color,
  otherLabel,
  labs,
  caption,
  strong,
  onOpen,
}: {
  d: PartDiff;
  color: string;
  /** «Никишин» or «среднее»: whose lab line it is. */
  otherLabel: string;
  labs?: LabPair;
  /** Under the label: «лучше в 2 из 4». */
  caption?: string;
  strong?: boolean;
  onOpen?: () => void;
}) {
  const { column, mine, theirs, delta } = d;
  // Без известного максимума шкала — больший из двух баллов.
  const scale =
    column.max > 0 ? column.max : Math.max(mine ?? 0, theirs ?? 0, 1);
  const label = (
    <>
      <span className={cn(strong && "font-medium text-foreground")}>
        {column.label}
      </span>
      {column.max > 0 ? ` · из ${fmtScore(column.max)}` : ""}
      {caption ? ` · ${caption}` : ""}
    </>
  );
  const showLabs =
    labs &&
    ((labs.mine && labs.mine.status !== "none") ||
      (labs.theirs && labs.theirs.status !== "none"));
  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 items-center gap-0.5 truncate text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">{label}</span>
          <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden />
        </button>
      ) : (
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      )}
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
      {showLabs ? (
        <span className="col-span-2 flex flex-col text-[11px] leading-snug text-muted-foreground">
          {labs.mine ? <span>вы: {labText(labs.mine)}</span> : null}
          {labs.theirs ? (
            <span>
              {otherLabel}: {labText(labs.theirs)}
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

/** Sums of a column group as one row: «Тесты · из 30». */
function groupDiff(label: string, diffs: PartDiff[]): PartDiff {
  const sum = (side: "mine" | "theirs") => {
    const present = diffs.filter((d) => d[side] !== undefined);
    return present.length
      ? present.reduce((s, d) => s + (d[side] ?? 0), 0)
      : undefined;
  };
  const deltas = diffs.flatMap((d) => (d.delta == null ? [] : [d.delta]));
  const max = diffs.every((d) => d.column.max > 0)
    ? diffs.reduce((s, d) => s + d.column.max, 0)
    : 0;
  return {
    column: { key: `group:${label}`, label, max },
    mine: sum("mine"),
    theirs: sum("theirs"),
    delta: deltas.length ? deltas.reduce((s, v) => s + v, 0) : null,
  };
}

/**
 * Column-by-column comparison: «Тест 1…6» under one «Тесты» row with the
 * sums, labs with what pluses and the deadline did, columns nobody has
 * points in yet folded into one line.
 */
export function PartsBreakdown({
  diffs,
  color,
  otherLabel,
  mineLabs,
  theirLabs,
  onOpen,
}: {
  diffs: PartDiff[];
  color: string;
  otherLabel: string;
  mineLabs: GradeLabs;
  theirLabs: GradeLabs;
  /** Opens a column in detail (a subject of a stream rating). */
  onOpen?: (d: PartDiff) => (() => void) | undefined;
}) {
  const empty = diffs.filter(bothEmpty);
  const scored = diffs.filter((d) => !bothEmpty(d));
  const byKey = new Map(scored.map((d) => [d.column.key, d]));
  const labsOf = (key: string): LabPair | undefined =>
    key in mineLabs || key in theirLabs
      ? { mine: mineLabs[key], theirs: theirLabs[key] }
      : undefined;
  const row = (d: PartDiff) => (
    <PartRow
      key={d.column.key}
      d={d}
      color={color}
      otherLabel={otherLabel}
      labs={labsOf(d.column.key)}
      onOpen={onOpen?.(d)}
    />
  );
  return (
    <>
      <ul className="space-y-3">
        {groupColumns(scored.map((d) => d.column)).map((g) => {
          const items = g.columns.flatMap((c) => byKey.get(c.key) ?? []);
          if (items.length < 2) return items.map(row);
          const sum = groupDiff(g.label, items);
          const both = items.filter((d) => d.delta != null);
          const better = both.filter((d) => (d.delta ?? 0) > EPS).length;
          const worse = both.filter((d) => (d.delta ?? 0) < -EPS).length;
          return (
            <li key={sum.column.key} className="space-y-2.5">
              <ul>
                <PartRow
                  d={sum}
                  color={color}
                  otherLabel={otherLabel}
                  caption={
                    !both.length
                      ? ""
                      : better || worse
                        ? `лучше в ${better} из ${both.length}`
                        : "вровень"
                  }
                  strong
                />
              </ul>
              <ul className="ml-1 space-y-2.5 border-l pl-3">
                {items.map(row)}
              </ul>
            </li>
          );
        })}
      </ul>
      {empty.length ? (
        <p className="text-xs text-muted-foreground text-pretty">
          {`Пока без баллов у обоих: ${empty.map((d) => d.column.label).join(", ")}.`}
        </p>
      ) : null}
    </>
  );
}

function HighlightCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: (PartDiff & { delta: number })[];
  emptyText: string;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border px-3 py-2.5">
      <div className="text-xs font-medium">{title}</div>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((d) => (
            <li
              key={d.column.key}
              className="flex items-baseline gap-2 text-xs tabular-nums"
            >
              <span className="min-w-0 truncate">{d.column.label}</span>
              <span className="text-muted-foreground">
                {fmtScore(d.mine)} / {fmtScore(d.theirs)}
              </span>
              <span className={cn("ml-auto font-semibold", deltaTone(d.delta))}>
                {fmtDelta(d.delta)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

/** Where each side is furthest ahead: three columns each. */
export function Highlights({
  diffs,
  otherTitle,
}: {
  diffs: PartDiff[];
  /** «Где сильнее Никишин» or «Где выше среднее». */
  otherTitle: string;
}) {
  const both = diffs.filter(
    (d): d is PartDiff & { delta: number } => d.delta != null && !bothEmpty(d),
  );
  const ahead = both
    .filter((d) => d.delta > EPS)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const behind = both
    .filter((d) => d.delta < -EPS)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);
  if (!ahead.length && !behind.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <HighlightCard
        title="Где вы сильнее"
        items={ahead}
        emptyText="Пока нигде"
      />
      <HighlightCard title={otherTitle} items={behind} emptyText="Нигде" />
    </div>
  );
}
