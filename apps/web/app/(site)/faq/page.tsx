import type { Metadata } from "next";

import { type FaqEntry, FaqList } from "@/components/site/faq/faq-list";
import { MdxBody } from "@/components/site/mdx-content";
import { PageHeader } from "@/components/site/page-header";
import { getFAQ } from "@/lib/api/public";
import { renderMdx } from "@/lib/mdx/render";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Частые вопросы",
  description:
    "Ответы на частые вопросы о сдаче лабораторных, дедлайнах, баллах и организационных моментах.",
  path: "/faq",
});

export default async function FaqPage() {
  const items = await getFAQ();
  const entries: FaqEntry[] = await Promise.all(
    items.map(async (it) => {
      const rendered = await renderMdx(it.answer);
      return {
        id: it.id,
        question: it.question,
        category: it.category,
        searchText: `${it.question}\n${it.category}\n${it.answer}`,
        answer: <MdxBody rendered={rendered} />,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Помощь"
        title="Частые вопросы"
        description="Собрали ответы на то, что спрашивают чаще всего. Не нашли своё — спросите в чате группы."
      />
      <FaqList items={entries} />
    </div>
  );
}
