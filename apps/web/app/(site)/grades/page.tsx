import type { Metadata } from "next";

import { GradesBoard } from "@/components/site/grades/grades-board";
import { PageHeader } from "@/components/site/page-header";
import { cookieHeader } from "@/lib/api/cookies";
import { getGrades } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Баллы",
  description: "Баллы из таблиц преподавателей и рейтинг группы и курса.",
  path: "/grades",
  // Рейтинг открыт всем, но фамилии с баллами в поисковиках ни к чему.
  noindex: true,
});

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  const cookie = await cookieHeader();
  const { source } = await searchParams;
  const raw = Array.isArray(source) ? source[0] : source;
  const data = await getGrades(
    cookie,
    raw && /^\d+$/.test(raw) ? Number(raw) : undefined,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Рейтинг"
        title="Баллы"
        description="Баллы из таблиц преподавателей: места в группе, на курсе и среди тех, кто есть на сайте."
      />
      <GradesBoard initial={data} />
    </div>
  );
}
