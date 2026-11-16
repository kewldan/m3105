import { SITE_URL } from "@/lib/seo";

/**
 * SVG cards with scores for a GitHub README, drawn by the API at
 * /api/badges/{style}. Keep the names in sync with `badges.Styles()` in Go.
 */
export type BadgeTheme = "dark" | "light";

export type BadgeFamily = {
  id: string;
  title: string;
  /** Style names by theme; a single-look family has only `dark` or `light`. */
  styles: Partial<Record<BadgeTheme, string>>;
  /** Wider than a README column. */
  wide?: boolean;
};

export const BADGE_FAMILIES: BadgeFamily[] = [
  {
    id: "classic",
    title: "Классика",
    styles: { dark: "dark", light: "light" },
  },
  {
    id: "rings",
    title: "Кольца",
    styles: { dark: "rings-dark", light: "rings-light" },
  },
  {
    id: "scoreboard",
    title: "Табло",
    styles: { dark: "scoreboard-dark", light: "scoreboard-light" },
    wide: true,
  },
  {
    id: "contrib",
    title: "Сетка вкладов",
    styles: { dark: "contrib-dark", light: "contrib-light" },
  },
  { id: "terminal", title: "Терминал", styles: { dark: "terminal" } },
  { id: "neon", title: "Неон", styles: { dark: "neon" } },
  { id: "pixel", title: "Пиксельный HUD", styles: { dark: "pixel" } },
  { id: "brutal", title: "Брутализм", styles: { light: "brutal" } },
  { id: "swiss", title: "Швейцарский постер", styles: { light: "swiss" } },
  { id: "gradebook", title: "Зачётка", styles: { light: "gradebook" } },
  { id: "receipt", title: "Чек", styles: { light: "receipt" } },
  {
    id: "shields",
    title: "Бейджи shields.io",
    styles: { light: "shields" },
    wide: true,
  },
];

export const ISU_RE = /^\d{4,10}$/;

export type BadgeOptions = {
  isu: string;
  /** Subject slugs in order; empty means all. */
  subjects: string[];
  hideName: boolean;
  hideTotal: boolean;
};

/** Short address of a card, e.g. https://m3105.ru/api/badges/dark?isu=… */
export function badgeUrl(
  style: string,
  o: BadgeOptions,
  base: string = SITE_URL,
): string {
  const q = new URLSearchParams({ isu: o.isu });
  if (o.subjects.length > 0) q.set("subjects", o.subjects.join(","));
  if (o.hideName) q.set("name", "0");
  if (o.hideTotal && style === "shields") q.set("total", "0");
  // URLSearchParams кодирует запятую, а в README читаемый адрес приятнее.
  return `${base}/api/badges/${style}?${q.toString().replaceAll("%2C", ",")}`;
}

export const BADGE_LINK = `${SITE_URL}/grades`;
export const BADGE_ALT = "Баллы на m3105.ru";

/** Markdown for a single style. */
export function badgeMarkdown(url: string): string {
  return `[![${BADGE_ALT}](${url})](${BADGE_LINK})`;
}

/** HTML; with both themes GitHub picks the one matching the reader's theme. */
export function badgeHtml(urls: Partial<Record<BadgeTheme, string>>): string {
  const { dark, light } = urls;
  if (dark && light) {
    return [
      `<a href="${BADGE_LINK}">`,
      "  <picture>",
      `    <source media="(prefers-color-scheme: dark)" srcset="${dark}">`,
      `    <img alt="${BADGE_ALT}" src="${light}">`,
      "  </picture>",
      "</a>",
    ].join("\n");
  }
  return `<a href="${BADGE_LINK}"><img alt="${BADGE_ALT}" src="${dark ?? light}"></a>`;
}
