import type { Metadata } from "next";

import { type FaqEntry, FaqList } from "@/components/site/faq/faq-list";
import { JsonLd } from "@/components/site/json-ld";
import { MdxBody } from "@/components/site/mdx-content";
import { PageHeader } from "@/components/site/page-header";
import { getFAQ } from "@/lib/api/public";
import { mdxToMarkdown } from "@/lib/llms/markdown";
import { renderMdx } from "@/lib/mdx/render";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Частые вопросы",
  description:
    "Ответы на частые вопросы о сдаче лабораторных, дедлайнах, баллах и организационных моментах.",
  path: "/faq",
  markdown: true,
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
      {items.length > 0 ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            url: absoluteUrl("/faq"),
            inLanguage: "ru",
            mainEntity: items.map((it) => ({
              "@type": "Question",
              name: it.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: mdxToMarkdown(it.answer, absoluteUrl("/faq")),
              },
            })),
          }}
        />
      ) : null}
      <PageHeader
        eyebrow="Помощь"
        title="Частые вопросы"
        description="Собрали ответы на то, что спрашивают чаще всего. Не нашли своё — спросите в чате группы."
      />
      <FaqList items={entries} />
    </div>
  );
}
