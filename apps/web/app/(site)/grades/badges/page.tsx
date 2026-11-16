import type { Metadata } from "next";

import {
  BadgeBuilder,
  type BadgeSubject,
} from "@/components/site/grades/badge-builder";
import { PageHeader } from "@/components/site/page-header";
import { getGrades } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Карточка баллов для GitHub",
  description:
    "Конструктор SVG-карточек и бейджей с баллами и местами в рейтинге для README профиля на GitHub.",
  path: "/grades/badges",
});

export default async function BadgesPage() {
  // Без куки: в карточку попадают только общие таблицы, без «только для своих».
  const data = await getGrades().catch(() => null);
  const seen = new Set<string>();
  const subjects: BadgeSubject[] = [];
  for (const s of data?.sources ?? []) {
    if (s.stream || s.membersOnly || seen.has(s.subjectSlug)) continue;
    seen.add(s.subjectSlug);
    subjects.push({ slug: s.subjectSlug, name: s.title || s.subjectName });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Баллы"
        title="Карточка для GitHub"
        description="Баллы и места в рейтинге картинкой для README профиля. Выберите оформление, скопируйте код — цифры дальше обновляются сами."
      />
      <BadgeBuilder subjects={subjects} />
    </div>
  );
}
