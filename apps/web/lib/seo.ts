import type { Metadata } from "next";

/** Site-wide SEO constants and a helper that builds consistent page metadata. */

export const SITE_NAME = "М3105";
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
export const DEFAULT_DESCRIPTION =
  "Сайт группы М3105: дедлайны лабораторных, календарь с ICS-подпиской, конспекты лекций, квизы для самопроверки и запись на сдачи.";
export const LOCALE = "ru_RU";

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

type PageMeta = {
  /** Page title; goes through the root template unless `absolute` is set. */
  title: string;
  absolute?: boolean;
  description?: string | null;
  /** Path used for the canonical URL and og:url, e.g. "/labs". */
  path: string;
  type?: "website" | "article";
  publishedTime?: string | null;
  modifiedTime?: string | null;
  section?: string;
  tags?: string[];
  /** Hide from search engines (login, profile). */
  noindex?: boolean;
  /**
   * Path of the Open Graph image served by app/og (e.g. "/og/lab/{subject}/{slug}").
   * Defaults to the generic site card. Next ignores a segment's file-based
   * opengraph-image once that segment defines `openGraph`, so images are explicit.
   */
  image?: string;
  imageAlt?: string;
};

export const DEFAULT_OG_IMAGE = "/og/site";

export function pageMetadata(meta: PageMeta): Metadata {
  const description = meta.description?.trim() || DEFAULT_DESCRIPTION;
  const url = absoluteUrl(meta.path);
  const ogTitle = meta.absolute ? meta.title : `${meta.title} — ${SITE_NAME}`;
  const images = [
    {
      url: absoluteUrl(meta.image ?? DEFAULT_OG_IMAGE),
      width: 1200,
      height: 630,
      alt: meta.imageAlt ?? ogTitle,
    },
  ];
  const openGraph: NonNullable<Metadata["openGraph"]> =
    meta.type === "article"
      ? {
          type: "article",
          title: ogTitle,
          description,
          url,
          siteName: SITE_NAME,
          locale: LOCALE,
          publishedTime: meta.publishedTime ?? undefined,
          modifiedTime: meta.modifiedTime ?? undefined,
          section: meta.section,
          tags: meta.tags,
          images,
        }
      : {
          type: "website",
          title: ogTitle,
          description,
          url,
          siteName: SITE_NAME,
          locale: LOCALE,
          images,
        };
  return {
    title: meta.absolute ? { absolute: meta.title } : meta.title,
    description,
    alternates: { canonical: url },
    openGraph,
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images,
    },
    ...(meta.noindex
      ? { robots: { index: false, follow: false, nocache: true } }
      : {}),
  };
}

/** Trims text for meta descriptions: single line, at most `max` characters. */
export function metaText(text: string | null | undefined, max = 160): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}…`;
}
