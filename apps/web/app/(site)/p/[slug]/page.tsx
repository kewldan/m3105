import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { breadcrumbs, JsonLd } from "@/components/site/json-ld";
import { MdxBody } from "@/components/site/mdx-content";
import { PageHeader } from "@/components/site/page-header";
import { Toc } from "@/components/site/toc";
import { isNotFound } from "@/lib/api/client";
import { getPage } from "@/lib/api/public";
import type { Page } from "@/lib/api/types";
import { fmtDateYear } from "@/lib/format";
import { renderMdx } from "@/lib/mdx/render";
import { absoluteUrl, metaText, pageMetadata } from "@/lib/seo";

type Params = Promise<{ slug: string }>;

const load = cache(async (slug: string): Promise<Page | null> => {
  try {
    return await getPage(slug);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  return pageMetadata({
    title: page.title,
    description: metaText(page.summary),
    path: `/p/${page.slug}`,
    type: "article",
    publishedTime: page.createdAt,
    modifiedTime: page.updatedAt,
  });
}

export default async function StaticPage({ params }: { params: Params }) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  const rendered = await renderMdx(page.content);

  return (
    <article className="space-y-8">
      <JsonLd
        data={breadcrumbs([
          { name: page.title, url: absoluteUrl(`/p/${page.slug}`) },
        ])}
      />
      <PageHeader title={page.title} description={page.summary || undefined} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-8">
          <Toc items={rendered.toc} variant="inline" className="lg:hidden" />
          <div className="animate-fade-in">
            <MdxBody rendered={rendered} />
          </div>
          <p className="text-xs text-muted-foreground">
            Обновлено {fmtDateYear(page.updatedAt)}
          </p>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Toc items={rendered.toc} />
          </div>
        </aside>
      </div>
    </article>
  );
}
