import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/site/empty-state";
import { NotesOverview } from "@/components/site/notes/notes-overview";
import { SubjectNotes } from "@/components/site/notes/subject-notes";
import { SubjectRail } from "@/components/site/notes/subject-rail";
import { PageHeader } from "@/components/site/page-header";
import { SubjectIcon } from "@/components/site/subject-icon";
import { getNotes, getSubjects } from "@/lib/api/public";
import { plural } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Конспекты лекций",
  description:
    "Конспекты лекций и практик по всем предметам семестра с формулами, кодом и квизами для самопроверки.",
  path: "/notes",
});

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const [{ subject: subjectSlug }, subjects] = await Promise.all([
    searchParams,
    getSubjects(),
  ]);
  const active = subjectSlug
    ? subjects.find((s) => s.slug === subjectSlug)
    : undefined;
  if (subjectSlug && !active) notFound();

  const total = subjects.reduce((sum, s) => sum + s.notesCount, 0);
  const subjectsWithNotes = subjects.filter((s) => s.notesCount > 0).length;

  // Only the selected subject's lectures are loaded; the overview needs the
  // whole (lightweight, body-less) list to show per-subject freshness.
  const notes = active ? await getNotes(active.slug) : await getNotes();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Материалы"
        title="Конспекты лекций"
        description={
          total > 0
            ? `${total} ${plural(total, "лекция", "лекции", "лекций")} по ${subjectsWithNotes} ${plural(subjectsWithNotes, "предмету", "предметам", "предметам")}. Выберите предмет, ищите по названию или номеру.`
            : "Здесь будут появляться конспекты по мере публикации."
        }
      />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <SubjectRail subjects={subjects} active={active?.slug} total={total} />

        <div className="min-w-0">
          {active ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <SubjectIcon
                  icon={active.icon}
                  color={active.color}
                  size="md"
                />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-tight">
                    {active.name}
                  </h2>
                  {active.teacher ? (
                    <div className="truncate text-sm text-muted-foreground">
                      {active.teacher}
                    </div>
                  ) : null}
                </div>
              </div>
              {notes.length === 0 ? (
                <EmptyState
                  title="По этому предмету конспектов пока нет"
                  description="Загляните позже или выберите другой предмет."
                />
              ) : (
                <SubjectNotes subject={active} notes={notes} />
              )}
            </div>
          ) : (
            <NotesOverview subjects={subjects} notes={notes} />
          )}
        </div>
      </div>
    </div>
  );
}
