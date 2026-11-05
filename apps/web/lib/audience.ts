/**
 * Audience tokens from the API: "stream:1" — a whole stream, "group:М3105" —
 * one group; an empty list means everyone.
 */

export function audienceStreams(a: string[]): number[] {
  return a
    .filter((t) => t.startsWith("stream:"))
    .map((t) => Number(t.slice(7)))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((x, y) => x - y);
}

export function audienceGroups(a: string[]): string[] {
  return a.filter((t) => t.startsWith("group:")).map((t) => t.slice(6));
}

/** 1,2,3,4,6 → "1–4, 6". */
function ranges(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : String(ns[i]));
    i = j;
  }
  return out.join(", ");
}

/** Short human label: "Потоки 1–4", "Поток 5, М3121", ""  for everyone. */
export function formatAudience(a: string[] | undefined): string {
  if (!a || a.length === 0) return "";
  const streams = audienceStreams(a);
  const groups = audienceGroups(a);
  const parts: string[] = [];
  if (streams.length > 0)
    parts.push(`${streams.length > 1 ? "Потоки" : "Поток"} ${ranges(streams)}`);
  if (groups.length > 0) parts.push(groups.join(", "));
  return parts.join(" · ");
}
