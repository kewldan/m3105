import type { MetadataRoute } from "next";

import {
  getFAQ,
  getLabs,
  getNotes,
  getPages,
  getSubjects,
} from "@/lib/api/public";
import { SITE_URL } from "@/lib/seo";

type Freq = "daily" | "weekly" | "monthly";

/** Latest `updatedAt` of a list; undefined for an empty one. */
function latest(items: { updatedAt: string }[]): Date | undefined {
  let max = 0;
  for (const it of items) max = Math.max(max, Date.parse(it.updatedAt) || 0);
  return max ? new Date(max) : undefined;
}

const route = (
  path: string,
  priority: number,
  changeFrequency: Freq,
  lastModified?: Date,
): MetadataRoute.Sitemap[number] => ({
  url: `${SITE_URL}${path}`,
  // Дата «сейчас» на каждый запрос приучает поисковики игнорировать
  // lastmod, поэтому у разделов — дата их самого свежего материала.
  ...(lastModified ? { lastModified } : {}),
  changeFrequency,
  priority,
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [subjects, labs, notes, pages, faq] = await Promise.all([
    getSubjects().catch(() => []),
    getLabs().catch(() => []),
    getNotes().catch(() => []),
    getPages().catch(() => []),
    getFAQ().catch(() => []),
  ]);
  return [
    route("", 1, "daily", latest([...labs, ...notes, ...subjects])),
    route("/calendar", 0.9, "daily"),
    route("/labs", 0.9, "daily", latest(labs)),
    route("/notes", 0.8, "daily", latest(notes)),
    route("/subjects", 0.7, "weekly", latest(subjects)),
    route("/practice", 0.6, "daily"),
    route("/faq", 0.5, "weekly", latest(faq)),
    route("/cpp", 0.5, "monthly"),
    ...subjects.map((s) =>
      route(`/subjects/${s.slug}`, 0.7, "weekly", new Date(s.updatedAt)),
    ),
    ...labs.map((l) =>
      route(
        `/labs/${l.subjectSlug}/${l.slug}`,
        0.8,
        "weekly",
        new Date(l.updatedAt),
      ),
    ),
    ...notes.map((n) =>
      route(
        `/notes/${n.subjectSlug}/${n.slug}`,
        0.7,
        "monthly",
        new Date(n.updatedAt),
      ),
    ),
    ...pages.map((p) =>
      route(`/p/${p.slug}`, 0.4, "monthly", new Date(p.updatedAt)),
    ),
  ];
}
