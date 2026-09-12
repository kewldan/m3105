import type { SubjectColor } from "@/lib/api/types";

export type ColorClasses = {
  /** Solid dot / accent bar. */
  dot: string;
  /** Soft tinted badge (bg + text). */
  badge: string;
  /** Text only. */
  text: string;
  /** Soft background for cards. */
  soft: string;
  /** Border tint. */
  border: string;
  /** Left accent stripe. */
  stripe: string;
};

const MAP: Record<SubjectColor, ColorClasses> = {
  blue: {
    dot: "bg-blue-500",
    badge: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    text: "text-blue-600 dark:text-blue-400",
    soft: "bg-blue-500/8",
    border: "border-blue-500/30",
    stripe: "border-l-blue-500",
  },
  indigo: {
    dot: "bg-indigo-500",
    badge: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
    text: "text-indigo-600 dark:text-indigo-400",
    soft: "bg-indigo-500/8",
    border: "border-indigo-500/30",
    stripe: "border-l-indigo-500",
  },
  violet: {
    dot: "bg-violet-500",
    badge: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    text: "text-violet-600 dark:text-violet-400",
    soft: "bg-violet-500/8",
    border: "border-violet-500/30",
    stripe: "border-l-violet-500",
  },
  cyan: {
    dot: "bg-cyan-500",
    badge: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    text: "text-cyan-600 dark:text-cyan-400",
    soft: "bg-cyan-500/8",
    border: "border-cyan-500/30",
    stripe: "border-l-cyan-500",
  },
  teal: {
    dot: "bg-teal-500",
    badge: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    text: "text-teal-600 dark:text-teal-400",
    soft: "bg-teal-500/8",
    border: "border-teal-500/30",
    stripe: "border-l-teal-500",
  },
  emerald: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
    soft: "bg-emerald-500/8",
    border: "border-emerald-500/30",
    stripe: "border-l-emerald-500",
  },
  amber: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
    soft: "bg-amber-500/8",
    border: "border-amber-500/30",
    stripe: "border-l-amber-500",
  },
  orange: {
    dot: "bg-orange-500",
    badge: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
    text: "text-orange-600 dark:text-orange-400",
    soft: "bg-orange-500/8",
    border: "border-orange-500/30",
    stripe: "border-l-orange-500",
  },
  rose: {
    dot: "bg-rose-500",
    badge: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-400",
    soft: "bg-rose-500/8",
    border: "border-rose-500/30",
    stripe: "border-l-rose-500",
  },
  slate: {
    dot: "bg-slate-500",
    badge: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    text: "text-slate-600 dark:text-slate-400",
    soft: "bg-slate-500/8",
    border: "border-slate-500/30",
    stripe: "border-l-slate-500",
  },
};

export const COLOR_LABEL: Record<SubjectColor, string> = {
  blue: "Синий",
  indigo: "Индиго",
  violet: "Фиолетовый",
  cyan: "Голубой",
  teal: "Бирюзовый",
  emerald: "Зелёный",
  amber: "Янтарный",
  orange: "Оранжевый",
  rose: "Розовый",
  slate: "Серый",
};

export function subjectColor(
  color: SubjectColor | "" | undefined,
): ColorClasses {
  return MAP[(color || "slate") as SubjectColor] ?? MAP.slate;
}
