import type { QuizOption, QuizQuestion } from "@/lib/api/types";

/** Answer given by the user for one question. */
export type Answer =
  | { type: "single"; optionId: string | null }
  | { type: "multiple"; optionIds: string[] }
  | { type: "text"; value: string };

export function emptyAnswer(q: QuizQuestion): Answer {
  switch (q.type) {
    case "single":
      return { type: "single", optionId: null };
    case "multiple":
      return { type: "multiple", optionIds: [] };
    case "text":
      return { type: "text", value: "" };
  }
}

export function isAnswered(a: Answer): boolean {
  switch (a.type) {
    case "single":
      return a.optionId !== null;
    case "multiple":
      return a.optionIds.length > 0;
    case "text":
      return a.value.trim().length > 0;
  }
}

/** Normalises free-text answers: case, whitespace, ё/е, punctuation at the ends. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?"'«»()]+|[\s.,;:!?"'«»()]+$/g, "")
    .trim();
}

export function correctOptionIds(q: QuizQuestion): string[] {
  return (q.options ?? []).filter((o) => o.correct).map((o) => o.id);
}

/** Returns true when the answer is fully correct. */
export function isCorrect(q: QuizQuestion, a: Answer): boolean {
  if (q.type === "single" && a.type === "single") {
    return a.optionId !== null && correctOptionIds(q).includes(a.optionId);
  }
  if (q.type === "multiple" && a.type === "multiple") {
    const want = new Set(correctOptionIds(q));
    const got = new Set(a.optionIds);
    if (want.size !== got.size) return false;
    for (const id of want) if (!got.has(id)) return false;
    return true;
  }
  if (q.type === "text" && a.type === "text") {
    const v = normalizeText(a.value);
    return (
      v.length > 0 && (q.answers ?? []).some((ans) => normalizeText(ans) === v)
    );
  }
  return false;
}

export type QuizResult = {
  correct: number;
  total: number;
  points: number;
  maxPoints: number;
  percent: number;
  perQuestion: { id: string; correct: boolean; points: number }[];
};

export function score(
  questions: QuizQuestion[],
  answers: Record<string, Answer>,
): QuizResult {
  let correct = 0;
  let points = 0;
  let maxPoints = 0;
  const perQuestion = questions.map((q) => {
    const p = q.points && q.points > 0 ? q.points : 1;
    maxPoints += p;
    const a = answers[q.id] ?? emptyAnswer(q);
    const ok = isCorrect(q, a);
    if (ok) {
      correct += 1;
      points += p;
    }
    return { id: q.id, correct: ok, points: ok ? p : 0 };
  });
  const total = questions.length;
  return {
    correct,
    total,
    points,
    maxPoints,
    percent: total === 0 ? 0 : Math.round((points / maxPoints) * 100),
    perQuestion,
  };
}

export function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Prepares a quiz run: optional shuffling of questions and options. */
export function prepare(
  questions: QuizQuestion[],
  opts: { shuffleQuestions: boolean; shuffleOptions: boolean },
): QuizQuestion[] {
  const qs = opts.shuffleQuestions ? shuffle(questions) : questions.slice();
  if (!opts.shuffleOptions) return qs;
  return qs.map((q) =>
    q.options ? { ...q, options: shuffle<QuizOption>(q.options) } : q,
  );
}

// ---- local history (browser only) ----

export type HistoryEntry = {
  at: string; // ISO
  percent: number;
  correct: number;
  total: number;
};

const HISTORY_KEY = "edu3105:quiz-history";

export function readHistory(slug: string): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, HistoryEntry[]>) : {};
    return all[slug] ?? [];
  } catch {
    return [];
  }
}

export function pushHistory(slug: string, entry: HistoryEntry): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, HistoryEntry[]>) : {};
    const list = [entry, ...(all[slug] ?? [])].slice(0, 20);
    all[slug] = list;
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    return list;
  } catch {
    return [];
  }
}
