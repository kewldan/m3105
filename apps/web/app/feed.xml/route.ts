import { getLabs, getNotes, getSettings } from "@/lib/api/public";
import { absoluteUrl, DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

/** RSS свежих конспектов и лабораторных: для читалок и агрегаторов. */
export const dynamic = "force-dynamic";

const LIMIT = 50;

const xml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

type Item = {
  guid: string;
  title: string;
  path: string;
  summary: string;
  category: string;
  date: string;
};

export async function GET() {
  const [settings, labs, notes] = await Promise.all([
    getSettings()
      .then((r) => r.settings)
      .catch(() => null),
    getLabs(),
    getNotes(),
  ]);
  const items: Item[] = [
    ...notes.map((n) => ({
      guid: `note-${n.id}`,
      title: `${n.subjectName}: ${n.title}`,
      path: `/notes/${n.subjectSlug}/${n.slug}`,
      summary: n.summary,
      category: n.subjectName,
      date: n.createdAt,
    })),
    ...labs.map((l) => ({
      guid: `lab-${l.id}`,
      title: `${l.subjectName}: лаба ${l.number}. ${l.title}`,
      path: `/labs/${l.subjectSlug}/${l.slug}`,
      summary: l.summary,
      category: l.subjectName,
      date: l.createdAt,
    })),
  ]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, LIMIT);

  const title = settings?.siteTitle || SITE_NAME;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xml(title)}</title>
<link>${absoluteUrl("/")}</link>
<description>${xml(settings?.description || DEFAULT_DESCRIPTION)}</description>
<language>ru</language>
<atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml"/>
${items
  .map(
    (it) => `<item>
<title>${xml(it.title)}</title>
<link>${absoluteUrl(it.path)}</link>
<guid isPermaLink="false">${it.guid}</guid>
<pubDate>${new Date(it.date).toUTCString()}</pubDate>
<category>${xml(it.category)}</category>
${it.summary ? `<description>${xml(it.summary)}</description>\n` : ""}</item>`,
  )
  .join("\n")}
</channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
