import type { MetadataRoute } from "next";

import { getLabs, getNotes, getPages, getSubjects } from "@/lib/api/public";
import { SITE_URL } from "@/lib/seo";

const STATIC: { path: string; priority: number; freq: "daily" | "weekly" }[] = [
  { path: "", priority: 1, freq: "daily" },
  { path: "/calendar", priority: 0.9, freq: "daily" },
  { path: "/labs", priority: 0.9, freq: "daily" },
  { path: "/notes", priority: 0.8, freq: "daily" },
  { path: "/subjects", priority: 0.7, freq: "weekly" },
  { path: "/practice", priority: 0.6, freq: "daily" },
  { path: "/faq", priority: 0.5, freq: "weekly" },
  { path: "/shawarma", priority: 0.5, freq: "daily" },
  { path: "/jokes", priority: 0.5, freq: "daily" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = STATIC.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
  try {
    const [subjects, labs, notes, pages] = await Promise.all([
      getSubjects(),
      getLabs(),
      getNotes(),
      getPages(),
    ]);
    return [
      ...staticRoutes,
      ...subjects.map((s) => ({
        url: `${SITE_URL}/subjects/${s.slug}`,
        lastModified: new Date(s.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...labs.map((l) => ({
        url: `${SITE_URL}/labs/${l.subjectSlug}/${l.slug}`,
        lastModified: new Date(l.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...notes.map((n) => ({
        url: `${SITE_URL}/notes/${n.subjectSlug}/${n.slug}`,
        lastModified: new Date(n.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
      ...pages.map((p) => ({
        url: `${SITE_URL}/p/${p.slug}`,
        lastModified: new Date(p.updatedAt),
        changeFrequency: "monthly" as const,
        priority: 0.4,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
