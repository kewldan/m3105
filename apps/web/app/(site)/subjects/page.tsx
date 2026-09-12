import type { Metadata } from "next";

import { EmptyState } from "@/components/site/empty-state";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { PageHeader } from "@/components/site/page-header";
import { SubjectCard } from "@/components/site/subjects/subject-card";
import { getSubjects } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Предметы",
  description:
    "Все предметы семестра: преподаватели, лабораторные, конспекты и квизы по каждому курсу.",
  path: "/subjects",
});

export default async function SubjectsPage() {
  const subjects = await getSubjects();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Семестр"
        title="Предметы"
        description="Выберите предмет, чтобы увидеть его лабы, конспекты и квизы."
      />
      {subjects.length === 0 ? (
        <EmptyState
          title="Предметов пока нет"
          description="Список появится, как только его заполнят в админке."
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <StaggerItem key={s.id} className="h-full">
              <SubjectCard subject={s} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
