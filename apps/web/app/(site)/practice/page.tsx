import type { Metadata } from "next";

import { PageHeader } from "@/components/site/page-header";
import { PracticeList } from "@/components/site/practice/practice-list";
import { cookieHeader } from "@/lib/api/cookies";
import { getPractice, getSettings } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Сдачи лаб",
  description:
    "Занятия, на которых принимают лабораторные: даты, аудитории, свободные места и запись на сдачу.",
  path: "/practice",
});

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string | string[] }>;
}) {
  const [{ session }, site, data] = await Promise.all([
    searchParams,
    getSettings(),
    getPractice(await cookieHeader()),
  ]);
  const raw = Array.isArray(session) ? session[0] : session;
  const highlightId = raw && /^\d+$/.test(raw) ? Number(raw) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Приём лаб"
        title="Сдачи"
        description={
          data.signedIn
            ? "Выберите пару и отметьте лабы, которые принесёте. Одногруппники видят, кто записан."
            : "Пары, на которых принимают лабораторные. Войдите, чтобы записаться и увидеть участников."
        }
      />
      <PracticeList
        initial={data}
        tz={site.settings.timezone}
        highlightId={highlightId}
      />
    </div>
  );
}
