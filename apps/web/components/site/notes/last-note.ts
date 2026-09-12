import type { SubjectColor } from "@/lib/api/types";

/** Last opened lecture, kept in the browser to offer «Продолжить чтение». */
export type LastNote = {
  subject: string;
  subjectName: string;
  subjectColor: SubjectColor | "";
  subjectIcon: string;
  slug: string;
  title: string;
  number: number;
  at: string;
};

const KEY = "edu3105:last-note";

export function readLastNote(): LastNote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastNote>;
    if (!parsed.subject || !parsed.slug || !parsed.title) return null;
    return parsed as LastNote;
  } catch {
    return null;
  }
}

export function writeLastNote(note: LastNote): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(note));
  } catch {
    // Storage may be unavailable (private mode); ignore.
  }
}

/** "3 сент." — compact date for dense lists. */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Сентябрь 2026" — month heading for grouped lists. */
export function monthLabel(ymd: string | null | undefined): string {
  if (!ymd) return "Без даты";
  const [y, m] = ymd.split("-").map(Number);
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(" г.", "");
}
