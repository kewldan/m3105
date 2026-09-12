import { TZDate } from "@date-fns/tz";

import { DEFAULT_TZ, toYmd } from "@/lib/format";

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Splits an RFC3339 instant into site-timezone date ("YYYY-MM-DD") and time ("HH:MM"). */
export function splitDateTime(
  iso: string | null | undefined,
  tz = DEFAULT_TZ,
): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new TZDate(new Date(iso), tz);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: toYmd(iso, tz), time: `${hh}:${mm}` };
}

/** Joins a date ("YYYY-MM-DD") and time ("HH:MM") in the site timezone into a UTC RFC3339 string. */
export function joinDateTime(
  date: string,
  time: string,
  tz = DEFAULT_TZ,
): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const safeTime = TIME_RE.test(time) ? time : "00:00";
  const [hh, mi] = safeTime.split(":").map(Number);
  const z = new TZDate(y, m - 1, d, hh, mi, tz);
  return new Date(z.getTime()).toISOString();
}

/** "YYYY-MM-DD" → local Date (for the calendar widget). */
export function ymdToDate(ymd: string | null | undefined): Date | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Local Date → "YYYY-MM-DD". */
export function dateToYmd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Best-effort "9:5" → "09:05"; returns the input untouched when it cannot be parsed. */
export function normalizeTime(raw: string): string {
  const s = raw.trim().replace(/[.,;\s]/g, ":");
  const m = s.match(/^(\d{1,2}):?(\d{1,2})$/);
  if (!m) return raw;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return raw;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
