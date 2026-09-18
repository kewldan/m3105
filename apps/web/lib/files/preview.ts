// Превью картинок из вложений. Без "use client": адреса строят и серверные
// компоненты (картинки в MDX), и клиентские (галерея, превью в формах).

/**
 * Ширины превью, которые отдаёт сервер (`files.Widths` в Go): уменьшенную копию
 * в WebP делает imgproxy. Без него, для GIF и SVG и для картинок уже нужной
 * ширины приходит оригинал, так что ссылка рабочая всегда.
 */
export const PREVIEW_WIDTHS = [160, 320, 640, 1280, 1920] as const;
export type PreviewWidth = (typeof PREVIEW_WIDTHS)[number];

const FILES_PREFIX = "/api/v1/files/";

/** Файл из нашего хранилища, у которого бывают превью. */
export const isStoredFile = (url: string) => url.startsWith(FILES_PREFIX);

export const previewSrc = (url: string, w: PreviewWidth) => `${url}?w=${w}`;

/** srcset из превью, не шире исходной картинки (если её ширина известна). */
export function previewSrcSet(
  url: string,
  widths: readonly PreviewWidth[],
  natural?: number | null,
): string {
  const usable = widths.filter((w) => !natural || w < natural);
  const parts = usable.map((w) => `${previewSrc(url, w)} ${w}w`);
  if (natural && usable.length < widths.length)
    parts.push(`${url} ${natural}w`);
  return parts.join(", ");
}
