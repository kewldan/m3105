import { ArrowRightIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/site/empty-state";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { PageHeader } from "@/components/site/page-header";
import { getPages } from "@/lib/api/public";
import type { Page } from "@/lib/api/types";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Полезное",
  description:
    "Полезные страницы группы: как закрыть предметы, бесплатные сервисы для студентов и другие инструкции.",
  path: "/p",
});

const OTHER = "Разное";

/**
 * Groups pages by category. The API already sorts them by position, so a
 * group goes where its first page is; pages without a category close the list.
 */
function groupPages(pages: Page[]): { title: string; pages: Page[] }[] {
  const groups = new Map<string, Page[]>();
  for (const p of pages) {
    const key = p.category || OTHER;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups]
    .map(([title, list]) => ({ title, pages: list }))
    .sort((a, b) => Number(a.title === OTHER) - Number(b.title === OTHER));
}

function PageCard({ page }: { page: Page }) {
  return (
    <Link
      href={`/p/${page.slug}`}
      className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FileTextIcon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading font-semibold leading-snug text-pretty">
          {page.title}
        </span>
        {page.summary ? (
          <span className="mt-1 block text-sm text-muted-foreground text-pretty">
            {page.summary}
          </span>
        ) : null}
      </span>
      <ArrowRightIcon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

export default async function UsefulPages() {
  const groups = groupPages(await getPages());
  const titled = groups.length > 1;
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Справка"
        title="Полезное"
        description="Инструкции и памятки, которые пригодятся в течение учёбы."
      />
      {groups.length === 0 ? (
        <EmptyState
          title="Пока пусто"
          description="Страницы появятся, когда их опубликуют в админке."
        />
      ) : (
        groups.map((g) => (
          <section key={g.title} className="space-y-3">
            {titled ? (
              <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                {g.title}
              </h2>
            ) : null}
            <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.pages.map((p) => (
                <StaggerItem key={p.id} className="h-full">
                  <PageCard page={p} />
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        ))
      )}
    </div>
  );
}
