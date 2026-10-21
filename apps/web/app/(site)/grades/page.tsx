import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PendingNotice } from "@/components/site/auth/pending-notice";
import { GradesBoard } from "@/components/site/grades/grades-board";
import { PageHeader } from "@/components/site/page-header";
import { cookieHeader } from "@/lib/api/cookies";
import { getMe, getMyGrades } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Баллы",
  description: "Баллы из таблиц преподавателей и рейтинг группы и курса.",
  path: "/grades",
  noindex: true,
});

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string | string[] }>;
}) {
  const cookie = await cookieHeader();
  const me = await getMe(cookie);
  if (!me || !cookie) redirect("/login?next=%2Fgrades");
  const header = (
    <PageHeader
      eyebrow="Рейтинг"
      title="Баллы"
      description="Баллы из таблиц преподавателей: ваше место в группе, на курсе и среди тех, кто есть на сайте."
    />
  );
  if (!me.user.approved) {
    return (
      <div className="space-y-6">
        {header}
        <PendingNotice />
      </div>
    );
  }
  const { source } = await searchParams;
  const raw = Array.isArray(source) ? source[0] : source;
  const data = await getMyGrades(
    cookie,
    raw && /^\d+$/.test(raw) ? Number(raw) : undefined,
  );

  return (
    <div className="space-y-6">
      {header}
      <GradesBoard initial={data} />
    </div>
  );
}
