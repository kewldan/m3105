"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RotateCcwIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildProfile,
  type MatcherData,
  type Ranked,
  rank,
} from "@/lib/matcher";
import { cn } from "@/lib/utils";

import { Badge, Level, type Tone } from "./cards";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * <Matcher data={{ dims, questions, items, … }} /> — анкета, которая
 * подбирает подходящие варианты. Модель подсчёта — в lib/matcher.ts.
 */
export function Matcher({ data }: { data: MatcherData }) {
  const total = data.questions.length;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[][]>(() =>
    data.questions.map(() => []),
  );
  const reduce = useReducedMotion();
  const done = step >= total;

  function choose(idx: number) {
    const q = data.questions[step];
    const next = answers.slice();
    if (q.multi) {
      const cur = next[step];
      next[step] = cur.includes(idx)
        ? cur.filter((i) => i !== idx)
        : [...cur, idx];
      setAnswers(next);
      return;
    }
    next[step] = [idx];
    setAnswers(next);
    setStep(step + 1);
  }

  function restart() {
    setAnswers(data.questions.map(() => []));
    setStep(0);
  }

  const progress = Math.min(step, total) / total;

  return (
    <div className="not-prose my-8 overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <SparklesIcon className="size-4 text-primary" aria-hidden />
          {done ? "Твой результат" : `Вопрос ${step + 1} из ${total}`}
        </span>
        {step > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (done ? restart() : setStep(step - 1))}
          >
            {done ? (
              <>
                <RotateCcwIcon /> Заново
              </>
            ) : (
              <>
                <ArrowLeftIcon /> Назад
              </>
            )}
          </Button>
        )}
      </div>
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -24 }}
          transition={{ duration: 0.18 }}
          className="p-5"
        >
          {done ? (
            <Results data={data} answers={answers} />
          ) : (
            <Question
              data={data}
              step={step}
              selected={answers[step]}
              onChoose={choose}
              onNext={() => setStep(step + 1)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Question({
  data,
  step,
  selected,
  onChoose,
  onNext,
}: {
  data: MatcherData;
  step: number;
  selected: number[];
  onChoose: (idx: number) => void;
  onNext: () => void;
}) {
  const q = data.questions[step];
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-lg font-semibold leading-snug">{q.text}</p>
        {(q.hint || q.multi) && (
          <p className="text-sm text-muted-foreground">
            {q.hint ?? "Можно выбрать несколько"}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((o, i) => {
          const on = selected.includes(i);
          return (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: варианты ответа не переставляются.
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => onChoose(i)}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted/50",
                on && "border-primary bg-primary/10",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center border text-primary-foreground",
                  q.multi ? "rounded-md" : "rounded-full",
                  on && "border-primary bg-primary",
                )}
              >
                {on && <CheckIcon className="size-3.5" />}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
      {q.multi && (
        <div className="flex justify-end">
          <Button onClick={onNext} disabled={selected.length === 0}>
            Дальше <ArrowRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}

function Results({
  data,
  answers,
}: {
  data: MatcherData;
  answers: number[][];
}) {
  const profile = buildProfile(data.questions, answers);
  const ranked = rank(data, profile);
  const [top, ...rest] = ranked;
  const dims = Object.entries(data.dims)
    .map(([k, label]) => ({ k, label, v: profile.vec[k] ?? 0 }))
    .filter((d) => d.v !== 0)
    .sort((a, b) => b.v - a.v);
  const maxDim = Math.max(1, ...dims.map((d) => Math.abs(d.v)));

  return (
    <div className="space-y-6">
      {top && <TopCard r={top} medal={MEDALS[0]} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {rest.slice(0, 2).map((r, i) => (
          <SmallCard key={r.item.id} r={r} medal={MEDALS[i + 1]} />
        ))}
      </div>

      {dims.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Твой профиль</p>
          <div className="space-y-1.5">
            {dims.map((d) => (
              <div
                key={d.k}
                className="grid grid-cols-[8.5rem_1fr] items-center gap-3 text-xs"
              >
                <span className="truncate text-muted-foreground">
                  {d.label}
                </span>
                <span className="relative h-2 rounded-full bg-muted">
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      d.v > 0 ? "bg-primary" : "bg-rose-500/70",
                    )}
                    style={{ width: `${(Math.abs(d.v) / maxDim) * 100}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="group rounded-xl border">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium hover:bg-muted/50 group-open:border-b">
          Весь рейтинг
        </summary>
        <ol className="divide-y">
          {ranked.map((r, i) => (
            <li key={r.item.id}>
              <a
                href={r.item.href}
                className="grid grid-cols-[1.5rem_1fr_6rem] items-center gap-3 px-4 py-2 text-sm hover:bg-muted/40"
              >
                <span className="text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="truncate">{r.item.title}</span>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 flex-1 rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${r.percent}%` }}
                    />
                  </span>
                  <span className="w-7 text-right text-xs tabular-nums">
                    {r.percent}%
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function Reasons({ r }: { r: Ranked }) {
  return (
    <ul className="space-y-1 text-sm">
      {r.reasons.map((x) => (
        <li key={x.text} className="flex gap-2">
          {x.tone === "good" ? (
            <ThumbsUpIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
          ) : (
            <ThumbsDownIcon className="mt-0.5 size-3.5 shrink-0 text-rose-500" />
          )}
          <span className="text-muted-foreground">{x.text}</span>
        </li>
      ))}
    </ul>
  );
}

function TopCard({ r, medal }: { r: Ranked; medal: string }) {
  return (
    <a
      href={r.item.href}
      className="block rounded-xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5 transition-colors hover:border-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {medal} Больше всего подходит
          </p>
          <p className="text-xl font-semibold leading-tight">{r.item.title}</p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-3xl font-bold tabular-nums text-primary">
          {r.percent}%
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r.item.badge && (
          <Badge tone={r.item.tone as Tone}>{r.item.badge}</Badge>
        )}
        {r.item.level !== undefined && <Level value={String(r.item.level)} />}
      </div>
      <div className="mt-3">
        <Reasons r={r} />
      </div>
    </a>
  );
}

function SmallCard({ r, medal }: { r: Ranked; medal: string }) {
  return (
    <a
      href={r.item.href}
      className="flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-snug">
          {medal} {r.item.title}
        </p>
        <span className="shrink-0 whitespace-nowrap text-lg font-semibold tabular-nums text-primary">
          {r.percent}%
        </span>
      </div>
      {r.item.level !== undefined && <Level value={String(r.item.level)} />}
      <Reasons r={r} />
    </a>
  );
}
