"use client";

import { CheckIcon, GraduationCapIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { UserAvatar } from "@/components/admin/user-avatar";
import { GroupBadge } from "@/components/site/group-badge";
import { theoryTotal } from "@/components/site/practice/theory-list";
import { Button } from "@/components/ui/button";
import type {
  Participant,
  PracticeResult,
  PracticeResultKind,
  PracticeSession,
} from "@/lib/api/types";
import { fmtTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULT_MINUTES = 90;

export const resultKey = (
  kind: PracticeResultKind,
  userId: number,
  labId: number,
) => `${kind}:${userId}:${labId}`;

export function indexResults(
  results: PracticeResult[],
): Map<string, PracticeResult> {
  return new Map(
    results.map((r) => [resultKey(r.kind, r.userId, r.labId), r] as const),
  );
}

/** Текущее время, обновляется раз в 30 секунд, пока компонент на экране. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export type Pace = {
  attempts: number;
  passed: number;
  /** Сколько записей ещё без отметки. */
  left: number;
  /** Минут на одну попытку: от начала пары до последней отметки. */
  minutesEach: number | null;
  /** Сколько ещё успеют до конца пары в том же темпе; null вне пары. */
  more: number | null;
};

/** Как идёт приём на паре: сколько отмечено, темп и прогноз до конца. */
export function livePace(
  session: PracticeSession,
  results: PracticeResult[],
  kind: PracticeResultKind,
  left: number,
  now: number,
): Pace {
  const marks = results.filter((r) => r.kind === kind);
  const start = new Date(session.startsAt).getTime();
  const end = session.endsAt
    ? new Date(session.endsAt).getTime()
    : start + DEFAULT_MINUTES * 60_000;
  const last = Math.max(0, ...marks.map((r) => new Date(r.gradedAt).getTime()));
  const minutesEach =
    marks.length > 0 && last > start
      ? (last - start) / 60_000 / marks.length
      : null;
  const more =
    minutesEach && now >= start && now < end
      ? Math.floor((end - now) / 60_000 / minutesEach)
      : null;
  return {
    attempts: marks.length,
    passed: marks.filter((r) => r.passed).length,
    left,
    minutesEach,
    more,
  };
}

export function fmtMinutes(m: number): string {
  return m < 10 ? m.toFixed(1).replace(".", ",") : String(Math.round(m));
}

/** «Защиты: приняли 5, не приняли 1, осталось 7 · ≈8 мин на одну · успеют ещё ~4». */
export function PaceLine({ label, pace }: { label: string; pace: Pace }) {
  const failed = pace.attempts - pace.passed;
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> приняли{" "}
      <span className="tabular-nums">{pace.passed}</span>
      {failed > 0 ? (
        <>
          , не приняли <span className="tabular-nums">{failed}</span>
        </>
      ) : null}
      , без отметки <span className="tabular-nums">{pace.left}</span>
      {pace.minutesEach != null ? (
        <> · ≈{fmtMinutes(pace.minutesEach)} мин на одну</>
      ) : null}
      {pace.more != null ? (
        <>
          {" "}
          · до конца пары успеют ещё ~
          <span className="tabular-nums">{pace.more}</span>
        </>
      ) : null}
    </p>
  );
}

/** Две кнопки «приняли» / «не приняли»; повторное нажатие снимает отметку. */
export function MarkButtons({
  result,
  disabled,
  what,
  onMark,
}: {
  result: PracticeResult | undefined;
  disabled?: boolean;
  /** Для подписей: «Пётр Сидоров, лаба 3». */
  what: string;
  onMark: (passed: boolean | null) => void;
}) {
  const passed = result?.passed === true;
  const failed = result?.passed === false;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {result ? (
        <span
          className="mr-0.5 text-xs text-muted-foreground tabular-nums"
          title={result.markedBy ? `Отметил(а): ${result.markedBy}` : undefined}
        >
          {fmtTime(result.gradedAt)}
        </span>
      ) : null}
      <Button
        type="button"
        size="icon-sm"
        variant={passed ? "default" : "outline"}
        disabled={disabled}
        aria-pressed={passed}
        aria-label={passed ? `Снять «приняли»: ${what}` : `Приняли: ${what}`}
        title={passed ? "Снять отметку" : "Приняли"}
        className={cn(
          passed &&
            "bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500",
        )}
        onClick={() => onMark(passed ? null : true)}
      >
        <CheckIcon />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant={failed ? "destructive" : "outline"}
        disabled={disabled}
        aria-pressed={failed}
        aria-label={
          failed ? `Снять «не приняли»: ${what}` : `Не приняли: ${what}`
        }
        title={failed ? "Снять отметку" : "Не приняли"}
        onClick={() => onMark(failed ? null : false)}
      >
        <XIcon />
      </Button>
    </div>
  );
}

/** Кто пришёл на теормин, с отметками по каждой лабе. */
export function TheoryMarks({
  theory,
  results,
  disabled,
  onMark,
}: {
  theory: Participant[];
  results: Map<string, PracticeResult>;
  disabled?: boolean;
  onMark: (userId: number, labId: number, passed: boolean | null) => void;
}) {
  const total = theoryTotal(theory);
  return (
    <section className="overflow-hidden rounded-xl border border-violet-500/25 bg-violet-500/5">
      <h3 className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
        <GraduationCapIcon className="size-3.5" aria-hidden />
        Теормин: {total} {plural(total, "отметка", "отметки", "отметок")} ·{" "}
        {theory.length}{" "}
        {plural(theory.length, "человек", "человека", "человек")}
      </h3>
      <ul className="divide-y border-t border-violet-500/15 bg-background">
        {theory.map((p) => (
          <li key={p.user.id} className="space-y-1.5 px-3 py-2">
            <div className="flex items-center gap-2">
              <UserAvatar
                name={p.user.name}
                photoUrl={p.user.photoUrl}
                size="sm"
              />
              <span className="truncate text-sm font-medium">
                {p.user.name}
              </span>
              <GroupBadge group={p.user.group} />
            </div>
            <ul className="space-y-1 pl-8">
              {p.labs.map((l) => {
                const r = results.get(resultKey("theory", p.user.id, l.id));
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5",
                      r?.passed === true && "bg-emerald-500/10",
                      r?.passed === false && "bg-destructive/5",
                    )}
                  >
                    <span className="truncate text-xs text-muted-foreground">
                      Лаба {l.number} · {l.title}
                    </span>
                    <MarkButtons
                      result={r}
                      disabled={disabled}
                      what={`${p.user.name}, теормин по лабе ${l.number}`}
                      onMark={(passed) => onMark(p.user.id, l.id, passed)}
                    />
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Отметки без записи: студент отписался или сдавал без записи. */
export function OrphanResults({
  results,
  disabled,
  onClear,
}: {
  results: PracticeResult[];
  disabled?: boolean;
  onClear: (r: PracticeResult) => void;
}) {
  if (results.length === 0) return null;
  return (
    <section className="rounded-xl border border-dashed">
      <h3 className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Отметки без записи
      </h3>
      <ul className="divide-y border-t">
        {results.map((r) => (
          <li
            key={resultKey(r.kind, r.userId, r.labId)}
            className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"
          >
            <span className="min-w-0 truncate">
              {r.userName} — {r.kind === "theory" ? "теормин по лабе" : "лаба"}{" "}
              {r.labNumber}
              {": "}
              {r.passed ? "приняли" : "не приняли"} в {fmtTime(r.gradedAt)}
            </span>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={disabled}
              onClick={() => onClear(r)}
            >
              Снять
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
