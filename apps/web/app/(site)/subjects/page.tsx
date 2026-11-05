import type { Metadata } from "next";
import { ScopeSwitch } from "@/components/site/audience/scope-switch";
import { EmptyState } from "@/components/site/empty-state";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { PageHeader } from "@/components/site/page-header";
import { SubjectCard } from "@/components/site/subjects/subject-card";
import { getSubjects } from "@/lib/api/public";
import { getViewerScope } from "@/lib/api/viewer";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Предметы",
  description:
    "Все предметы семестра: преподаватели, лабораторные, конспекты и квизы по каждому курсу.",
  path: "/subjects",
  markdown: true,
});

export default async function SubjectsPage() {
  const scope = await getViewerScope();
  const subjects = await getSubjects(scope.forGroup);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Семестр"
        title="Предметы"
        description="Выберите предмет, чтобы увидеть его лабы, конспекты и квизы."
        actions={<ScopeSwitch group={scope.group} all={scope.all} />}
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
