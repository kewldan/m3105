"use client";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  HistoryIcon,
  PlayIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import type { QuizQuestion } from "@/lib/api/types";
import { plural } from "@/lib/format";
import {
  type Answer,
  emptyAnswer,
  type HistoryEntry,
  isAnswered,
  isCorrect,
  prepare,
  pushHistory,
  type QuizResult,
  readHistory,
  score,
} from "@/lib/quiz";
import { cn } from "@/lib/utils";

import { InlineMarkdown } from "./inline-markdown";
import { ScoreRing } from "./score-ring";

export type RenderedQuestion = {
  prompt: ReactNode;
  explanation: ReactNode | null;
};

export type QuizPlayerProps = {
  quiz: {
    slug: string;
    title: string;
    description: string;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    questions: QuizQuestion[];
    noteSlug: string;
    noteTitle: string;
    subjectSlug: string;
  };
  rendered: Record<string, RenderedQuestion>;
};

type Phase = "intro" | "question" | "result";

const ease = [0.22, 1, 0.36, 1] as const;

const TYPE_HINT: Record<QuizQuestion["type"], string> = {
  single: "Выберите один вариант",
  multiple: "Выберите все подходящие варианты",
  text: "Введите ответ",
};

function fmtHistoryDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function verdict(percent: number): { title: string; text: string } {
  if (percent >= 90)
    return {
      title: "Отлично!",
      text: "Материал усвоен. Можно двигаться дальше.",
    };
  if (percent >= 70)
    return {
      title: "Хорошо",
      text: "Основное понятно, осталось закрепить детали.",
    };
  if (percent >= 50)
    return { title: "Неплохо", text: "Стоит повторить темы, где были ошибки." };
  return {
    title: "Стоит перечитать конспект",
    text: "Вернитесь к лекции и попробуйте ещё раз.",
  };
}

export function QuizPlayer({ quiz, rendered }: QuizPlayerProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("intro");
  const [order, setOrder] = useState<QuizQuestion[]>(quiz.questions);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [checked, setChecked] = useState(false);
  const [direction, setDirection] = useState(1);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(readHistory(quiz.slug));
  }, [quiz.slug]);

  const total = order.length;
  const current = order[index];
  const answer = current ? (answers[current.id] ?? emptyAnswer(current)) : null;
  const answered = answer ? isAnswered(answer) : false;
  const correctNow = current && answer ? isCorrect(current, answer) : false;

  const start = useCallback(() => {
    setOrder(
      prepare(quiz.questions, {
        shuffleQuestions: quiz.shuffleQuestions,
        shuffleOptions: quiz.shuffleOptions,
      }),
    );
    setAnswers({});
    setIndex(0);
    setChecked(false);
    setResult(null);
    setDirection(1);
    setPhase("question");
  }, [quiz]);

  const setAnswer = useCallback(
    (a: Answer) => {
      if (!current || checked) return;
      setAnswers((prev) => ({ ...prev, [current.id]: a }));
    },
    [current, checked],
  );

  const selectOption = useCallback(
    (optionId: string) => {
      if (!current || checked) return;
      if (current.type === "single") {
        setAnswer({ type: "single", optionId });
      } else if (current.type === "multiple") {
        const ids = answer?.type === "multiple" ? answer.optionIds : [];
        setAnswer({
          type: "multiple",
          optionIds: ids.includes(optionId)
            ? ids.filter((x) => x !== optionId)
            : [...ids, optionId],
        });
      }
    },
    [current, checked, answer, setAnswer],
  );

  const check = useCallback(() => {
    if (!answered) return;
    setChecked(true);
  }, [answered]);

  const finish = useCallback(
    (finalAnswers: Record<string, Answer>) => {
      const r = score(order, finalAnswers);
      setResult(r);
      const entry: HistoryEntry = {
        at: new Date().toISOString(),
        percent: r.percent,
        correct: r.correct,
        total: r.total,
      };
      setHistory(pushHistory(quiz.slug, entry));
      setPhase("result");
    },
    [order, quiz.slug],
  );

  const next = useCallback(() => {
    if (index + 1 >= total) {
      finish(answers);
      return;
    }
    setDirection(1);
    setIndex((i) => i + 1);
    setChecked(false);
  }, [index, total, answers, finish]);

  // Keyboard: 1–9 pick options, Enter checks / advances.
  useEffect(() => {
    if (phase !== "question" || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        (target instanceof HTMLInputElement &&
          target.type !== "radio" &&
          target.type !== "checkbox") ||
        target instanceof HTMLTextAreaElement;
      if (e.key === "Enter" && !typing) {
        e.preventDefault();
        if (checked) next();
        else check();
        return;
      }
      if (typing || checked) return;
      if (/^[1-9]$/.test(e.key) && current.options) {
        const opt = current.options[Number(e.key) - 1];
        if (opt) {
          e.preventDefault();
          selectOption(opt.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, current, checked, next, check, selectOption]);

  useEffect(() => {
    if (phase === "question" && current?.type === "text" && !checked) {
      inputRef.current?.focus();
    }
  }, [phase, current, checked]);

  const progress = useMemo(
    () =>
      total === 0 ? 0 : Math.round(((index + (checked ? 1 : 0)) / total) * 100),
    [index, checked, total],
  );

  if (quiz.questions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        В этом квизе пока нет вопросов.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "intro" ? (
          <motion.div
            key="intro"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease }}
            className="space-y-6"
          >
            <div className="rounded-2xl border bg-card p-6 sm:p-8">
              <div className="space-y-3">
                {quiz.description ? (
                  <p className="text-base text-muted-foreground text-pretty">
                    {quiz.description}
                  </p>
                ) : null}
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">
                      {quiz.questions.length}
                    </span>{" "}
                    {plural(
                      quiz.questions.length,
                      "вопрос",
                      "вопроса",
                      "вопросов",
                    )}
                  </li>
                  <li>Результат виден сразу после каждого ответа</li>
                  {quiz.shuffleQuestions ? (
                    <li>Порядок вопросов случайный</li>
                  ) : null}
                </ul>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button size="lg" onClick={start} className="px-5">
                  <PlayIcon data-icon="inline-start" />
                  Начать
                </Button>
              </div>
            </div>

            {history.length > 0 ? (
              <section className="space-y-3" aria-labelledby="quiz-history">
                <h2
                  id="quiz-history"
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
                >
                  <HistoryIcon className="size-4" />
                  Прошлые попытки
                </h2>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
                  {history.slice(0, 5).map((h) => (
                    <li
                      key={h.at}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="text-muted-foreground">
                        {fmtHistoryDate(h.at)}
                      </span>
                      <span className="tabular-nums">
                        {h.correct} из {h.total} ·{" "}
                        <span className="font-medium">{h.percent}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </motion.div>
        ) : null}

        {phase === "question" && current && answer ? (
          <motion.div
            key="question"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Вопрос{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {index + 1}
                  </span>{" "}
                  из {total}
                </span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} aria-label="Прогресс прохождения" />
            </div>

            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={current.id}
                  custom={direction}
                  initial={reduce ? false : { opacity: 0, x: 40 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? undefined : { opacity: 0, x: -40 * direction }}
                  transition={{ duration: 0.3, ease }}
                  className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7"
                >
                  <div className="space-y-2">
                    <div className="text-xs font-medium tracking-wide text-primary uppercase">
                      {TYPE_HINT[current.type]}
                    </div>
                    <div className="text-lg font-medium text-balance [&_.prose]:text-lg [&_.prose_p]:my-0">
                      {rendered[current.id]?.prompt ?? current.prompt}
                    </div>
                  </div>

                  {current.type === "text" ? (
                    <TextAnswer
                      ref={inputRef}
                      value={answer.type === "text" ? answer.value : ""}
                      disabled={checked}
                      correct={checked ? correctNow : null}
                      accepted={current.answers ?? []}
                      onChange={(v) => setAnswer({ type: "text", value: v })}
                      onEnter={() => (checked ? next() : check())}
                    />
                  ) : (
                    <Options
                      question={current}
                      answer={answer}
                      checked={checked}
                      onSelect={selectOption}
                    />
                  )}

                  <AnimatePresence initial={false}>
                    {checked ? (
                      <motion.div
                        key="feedback"
                        initial={reduce ? false : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={reduce ? undefined : { opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease }}
                        className="overflow-hidden"
                      >
                        <Feedback
                          correct={correctNow}
                          explanation={
                            rendered[current.id]?.explanation ?? null
                          }
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
                      {current.type !== "text" ? (
                        <span className="inline-flex items-center gap-1">
                          <Kbd>1</Kbd>–<Kbd>9</Kbd> выбрать
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Kbd>↵</Kbd> {checked ? "дальше" : "проверить"}
                      </span>
                    </div>
                    {checked ? (
                      <Button onClick={next} size="lg" className="sm:min-w-40">
                        {index + 1 >= total ? "К результатам" : "Дальше"}
                        <ArrowRightIcon data-icon="inline-end" />
                      </Button>
                    ) : (
                      <Button
                        onClick={check}
                        size="lg"
                        disabled={!answered}
                        className="sm:min-w-40"
                      >
                        Проверить
                      </Button>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}

        {phase === "result" && result ? (
          <motion.div
            key="result"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.4, ease }}
            className="space-y-6"
          >
            <ResultCard result={result} onRetry={start} noteHref="#content" />
            <Review
              order={order}
              answers={answers}
              result={result}
              rendered={rendered}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ---------- pieces ----------

function Options({
  question,
  answer,
  checked,
  onSelect,
}: {
  question: QuizQuestion;
  answer: Answer;
  checked: boolean;
  onSelect: (id: string) => void;
}) {
  const multiple = question.type === "multiple";
  const selected = new Set(
    answer.type === "single"
      ? answer.optionId
        ? [answer.optionId]
        : []
      : answer.type === "multiple"
        ? answer.optionIds
        : [],
  );
  return (
    <fieldset className="grid gap-2" disabled={checked}>
      <legend className="sr-only">Варианты ответа</legend>
      {(question.options ?? []).map((opt, i) => {
        const isSelected = selected.has(opt.id);
        const showCorrect = checked && opt.correct;
        const showWrong = checked && isSelected && !opt.correct;
        return (
          <label
            key={opt.id}
            className={cn(
              "group flex w-full cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition-all has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 sm:p-4",
              checked && "cursor-default",
              !checked && "hover:border-primary/50 hover:bg-primary/5",
              isSelected && !checked && "border-primary bg-primary/8",
              showCorrect && "border-emerald-500/60 bg-emerald-500/10",
              showWrong && "border-rose-500/60 bg-rose-500/10",
              checked && !showCorrect && !showWrong && "opacity-60",
            )}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`quiz-${question.id}`}
              value={opt.id}
              checked={isSelected}
              onChange={() => onSelect(opt.id)}
              className="sr-only"
            />
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center border text-[10px] font-semibold transition-colors",
                multiple ? "rounded-md" : "rounded-full",
                isSelected && !checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground",
                showCorrect && "border-emerald-500 bg-emerald-500 text-white",
                showWrong && "border-rose-500 bg-rose-500 text-white",
              )}
              aria-hidden
            >
              {showCorrect ? (
                <CheckIcon className="size-3" />
              ) : showWrong ? (
                <XIcon className="size-3" />
              ) : isSelected ? (
                <CheckIcon className="size-3" />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 flex-1 leading-snug">
              <InlineMarkdown text={opt.text} />
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function TextAnswer({
  ref,
  value,
  disabled,
  correct,
  accepted,
  onChange,
  onEnter,
}: {
  ref: React.RefObject<HTMLInputElement | null>;
  value: string;
  disabled: boolean;
  correct: boolean | null;
  accepted: string[];
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="space-y-2">
      <Input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder="Ваш ответ…"
        autoComplete="off"
        aria-invalid={correct === false ? true : undefined}
        className={cn(
          "h-11 text-base",
          correct === true && "border-emerald-500 ring-3 ring-emerald-500/20",
          correct === false && "border-rose-500 ring-3 ring-rose-500/20",
        )}
      />
      {correct === false && accepted.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Принимается:{" "}
          <span className="font-medium text-foreground">
            {accepted.join(", ")}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Feedback({
  correct,
  explanation,
}: {
  correct: boolean;
  explanation: ReactNode | null;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        correct
          ? "border-emerald-500/40 bg-emerald-500/8"
          : "border-rose-500/40 bg-rose-500/8",
      )}
      role="status"
    >
      {correct ? (
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <CircleXIcon className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-semibold">{correct ? "Верно!" : "Неверно"}</div>
        {explanation ? (
          <div className="[&_.prose]:text-sm [&_.prose_p]:my-1">
            {explanation}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultCard({
  result,
  onRetry,
  noteHref,
}: {
  result: QuizResult;
  onRetry: () => void;
  noteHref: string | null;
}) {
  const v = verdict(result.percent);
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card p-6 text-center sm:flex-row sm:text-left sm:p-8">
      <ScoreRing percent={result.percent} />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">{v.title}</h2>
          <p className="text-muted-foreground">{v.text}</p>
        </div>
        <p className="text-sm">
          Верно{" "}
          <span className="font-semibold tabular-nums">{result.correct}</span>{" "}
          из <span className="font-semibold tabular-nums">{result.total}</span>
          {result.maxPoints !== result.total ? (
            <span className="text-muted-foreground">
              {" "}
              · {result.points} из {result.maxPoints} баллов
            </span>
          ) : null}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button onClick={onRetry}>
            <RotateCcwIcon data-icon="inline-start" />
            Пройти ещё раз
          </Button>
          {noteHref ? (
            <Button variant="outline" render={<a href={noteHref} />}>
              <BookOpenIcon data-icon="inline-start" />
              Перечитать конспект
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function describeAnswer(q: QuizQuestion, a: Answer | undefined): string {
  if (!a) return "—";
  if (a.type === "single")
    return q.options?.find((o) => o.id === a.optionId)?.text ?? "—";
  if (a.type === "multiple") {
    const texts = a.optionIds
      .map((id) => q.options?.find((o) => o.id === id)?.text)
      .filter(Boolean);
    return texts.length ? texts.join(", ") : "—";
  }
  return a.value.trim() || "—";
}

function describeCorrect(q: QuizQuestion): string {
  if (q.type === "text") return (q.answers ?? []).join(", ");
  return (q.options ?? [])
    .filter((o) => o.correct)
    .map((o) => o.text)
    .join(", ");
}

function Review({
  order,
  answers,
  result,
  rendered,
}: {
  order: QuizQuestion[];
  answers: Record<string, Answer>;
  result: QuizResult;
  rendered: Record<string, RenderedQuestion>;
}) {
  const wrongIds = result.perQuestion
    .filter((p) => !p.correct)
    .map((p) => p.id);
  return (
    <section className="space-y-3" aria-labelledby="quiz-review">
      <h2 id="quiz-review" className="text-lg font-semibold">
        Разбор ответов
      </h2>
      <Accordion
        defaultValue={wrongIds}
        className="rounded-xl border bg-card px-4"
      >
        {order.map((q, i) => {
          const ok =
            result.perQuestion.find((p) => p.id === q.id)?.correct ?? false;
          return (
            <AccordionItem key={q.id} value={q.id}>
              <AccordionTrigger className="items-center gap-3 hover:no-underline">
                {ok ? (
                  <CircleCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleXIcon className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                )}
                <span className="min-w-0 flex-1 text-left">
                  <span className="mr-1.5 text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>
                  <InlineMarkdown text={q.prompt.split("\n")[0]} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      ok
                        ? "border-emerald-500/40 bg-emerald-500/8"
                        : "border-rose-500/40 bg-rose-500/8",
                    )}
                  >
                    <div className="text-xs text-muted-foreground">
                      Ваш ответ
                    </div>
                    <div className="font-medium">
                      <InlineMarkdown text={describeAnswer(q, answers[q.id])} />
                    </div>
                  </div>
                  {!ok ? (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/8 px-3 py-2">
                      <div className="text-xs text-muted-foreground">
                        Правильный ответ
                      </div>
                      <div className="font-medium">
                        <InlineMarkdown text={describeCorrect(q)} />
                      </div>
                    </div>
                  ) : null}
                </div>
                {rendered[q.id]?.explanation ? (
                  <div className="text-sm text-muted-foreground [&_.prose]:text-sm [&_.prose_p]:my-1">
                    {rendered[q.id].explanation}
                  </div>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
