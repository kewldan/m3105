/** Group names compared like the API does: case, spaces and Latin "M" ignored. */
export function normalizeGroup(name: string): string {
  return name.replace(/\s+/g, "").toUpperCase().replaceAll("M", "М");
}

export function sameGroup(a: string, b: string): boolean {
  const na = normalizeGroup(a);
  return na !== "" && na === normalizeGroup(b);
}

/** "М3105" → 5, "М3115" → 15: the number inside the stream, 1–25; null otherwise. */
export function groupNumber(name: string): number | null {
  const m = /^[^\d]*\d{2}(\d{2})$/.exec(normalizeGroup(name));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 25 ? n : null;
}

/**
 * Hue of a group's badge. The golden angle keeps neighbouring numbers far apart
 * on the colour wheel; lightness is fixed in the badge itself, so contrast does
 * not depend on the hue (≥ 5.5:1 light, ≥ 8.8:1 dark for all 25 groups).
 */
export function groupHue(n: number): number {
  return Math.round((n * 137.508 + 20) % 360);
}

export type GroupTrack = "itpro" | "ds";

export const TRACK_LABEL: Record<GroupTrack, string> = {
  itpro: "ТОП ИТ ПРО",
  ds: "ТОП ДС",
};

/** Track of a group by its number: 1–5 «ТОП ИТ ПРО», 6–10 «ТОП ДС». */
export function groupTrack(n: number): GroupTrack | null {
  if (n >= 1 && n <= 5) return "itpro";
  if (n >= 6 && n <= 10) return "ds";
  return null;
}
