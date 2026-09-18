import { TZDate } from "@date-fns/tz";
import {
  differenceInCalendarDays,
  formatDistanceToNowStrict,
  isPast,
} from "date-fns";
import { ru } from "date-fns/locale";

export const DEFAULT_TZ = "Europe/Moscow";

export const WEEKDAYS_FULL = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function parityLabel(parity: "odd" | "even" | "both"): string {
  if (parity === "odd") return "Нечётная";
  if (parity === "even") return "Чётная";
  return "Каждую неделю";
}

export const EVENT_KIND_LABEL: Record<string, string> = {
  deadline: "Дедлайн",
  test: "Контрольная",
  exam: "Экзамен",
  consultation: "Консультация",
  other: "Событие",
  practice: "Сдача лаб",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  published: "Опубликовано",
};

/** Convert an ISO string to a TZDate in the site timezone. */
export function inTz(iso: string | Date, tz: string = DEFAULT_TZ): TZDate {
  return new TZDate(typeof iso === "string" ? new Date(iso) : iso, tz);
}

/** ISO week day (1 = Monday) for a date in the given tz. */
export function isoWeekday(d: Date | string, tz = DEFAULT_TZ): number {
  const day = inTz(d, tz).getDay();
  return day === 0 ? 7 : day;
}

const dateFmt = (tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...opts });

export function fmtDate(iso: string | Date, tz = DEFAULT_TZ): string {
  return dateFmt(tz, { day: "numeric", month: "long" }).format(new Date(iso));
}

export function fmtDateYear(iso: string | Date, tz = DEFAULT_TZ): string {
  return dateFmt(tz, { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

export function fmtDateShort(iso: string | Date, tz = DEFAULT_TZ): string {
  return dateFmt(tz, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export function fmtTime(iso: string | Date, tz = DEFAULT_TZ): string {
  return dateFmt(tz, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

export function fmtDateTime(iso: string | Date, tz = DEFAULT_TZ): string {
  return dateFmt(tz, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtWeekdayDate(iso: string | Date, tz = DEFAULT_TZ): string {
  return dateFmt(tz, { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso),
  );
}

/** "2026-09-01" → "1 сентября 2026". */
export function fmtDateOnly(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return dateFmt("UTC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "через 3 дня" / "2 дня назад". */
export function fmtRelative(iso: string | Date): string {
  return formatDistanceToNowStrict(new Date(iso), {
    addSuffix: true,
    locale: ru,
  });
}

/** Whole calendar days from today to the date (negative when in the past). */
export function daysUntil(iso: string | Date, tz = DEFAULT_TZ): number {
  return differenceInCalendarDays(inTz(iso, tz), inTz(new Date(), tz));
}

export function isOverdue(iso: string | Date): boolean {
  return isPast(new Date(iso));
}

export function plural(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/** "3 дня", "1 день", "5 дней". */
export function daysWord(n: number): string {
  return `${n} ${plural(n, "день", "дня", "дней")}`;
}

/** Date-only ISO (YYYY-MM-DD) in the site tz for a given instant. */
export function toYmd(d: Date | string, tz = DEFAULT_TZ): string {
  const z = inTz(d, tz);
  const mm = String(z.getMonth() + 1).padStart(2, "0");
  const dd = String(z.getDate()).padStart(2, "0");
  return `${z.getFullYear()}-${mm}-${dd}`;
}

/** Размер файла: «840 КБ», «3,2 МБ». */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}
