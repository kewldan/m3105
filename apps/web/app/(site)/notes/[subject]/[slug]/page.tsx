import { CalendarIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { breadcrumbs, JsonLd } from "@/components/site/json-ld";
import { MdxBody } from "@/components/site/mdx-content";
import { CourseOutline } from "@/components/site/notes/course-outline";
import { NoteNav } from "@/components/site/notes/note-nav";
import { ReadingProgress } from "@/components/site/notes/reading-progress";
import { RememberNote } from "@/components/site/notes/remember-note";
import { NoteQuizzes } from "@/components/site/quiz/note-quizzes";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Toc } from "@/components/site/toc";
import { isNotFound } from "@/lib/api/client";
import { getNote, getNotes } from "@/lib/api/public";
import type { NoteResponse } from "@/lib/api/types";
import { fmtDateOnly } from "@/lib/format";
import { renderMdx } from "@/lib/mdx/render";
import { absoluteUrl, metaText, pageMetadata, SITE_NAME } from "@/lib/seo";

type Params = Promise<{ subject: string; slug: string }>;

const load = cache(
  async (subject: string, slug: string): Promise<NoteResponse | null> => {
    try {
      return await getNote(subject, slug);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  },
);

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { subject, slug } = await params;
  const note = await load(subject, slug);
  if (!note) notFound();
  return pageMetadata({
    title: `${note.title} — ${note.subjectName}`,
    description:
      metaText(note.summary) ||
      `Конспект лекции ${note.number} по предмету «${note.subjectName}».`,
    path: `/notes/${note.subjectSlug}/${note.slug}`,
    type: "article",
    publishedTime: note.lectureDate ?? note.createdAt,
    modifiedTime: note.updatedAt,
    section: note.subjectName,
    tags: [note.subjectName, "конспект"],
  });
}

export default async function NotePage({ params }: { params: Params }) {
  const { subject, slug } = await params;
  const [note, siblings] = await Promise.all([
    load(subject, slug),
    getNotes(subject).catch(() => []),
  ]);
  if (!note) notFound();
  const rendered = await renderMdx(note.content);
  const outlineSubject = {
    slug: note.subjectSlug,
    name: note.subjectName,
    color: note.subjectColor,
    icon: note.subjectIcon,
  };
  const hasOutline = siblings.length > 1;

  const noteUrl = absoluteUrl(`/notes/${note.subjectSlug}/${note.slug}`);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: note.title,
          description: metaText(note.summary) || undefined,
          url: noteUrl,
          inLanguage: "ru",
          datePublished: note.lectureDate ?? note.createdAt,
          dateModified: note.updatedAt,
          articleSection: note.subjectName,
          author: { "@type": "Organization", name: SITE_NAME },
          publisher: { "@type": "Organization", name: SITE_NAME },
          isPartOf: {
            "@type": "Course",
            name: note.subjectName,
            url: absoluteUrl(`/subjects/${note.subjectSlug}`),
          },
        }}
      />
      <JsonLd
        data={breadcrumbs([
          { name: "Конспекты", url: absoluteUrl("/notes") },
          {
            name: note.subjectName,
            url: absoluteUrl(`/subjects/${note.subjectSlug}`),
          },
          { name: note.title, url: noteUrl },
        ])}
      />
      <ReadingProgress />
      <RememberNote note={note} />
      <article className="space-y-8">
        <header className="animate-rise space-y-4">
          <nav
            aria-label="Хлебные крошки"
            className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
          >
            <Link
              href="/notes"
              className="transition-colors hover:text-foreground"
            >
              Конспекты
            </Link>
            <ChevronRightIcon className="size-3.5" />
            <Link
              href={`/notes?subject=${encodeURIComponent(note.subjectSlug)}`}
              className="truncate transition-colors hover:text-foreground"
            >
              {note.subjectName}
            </Link>
          </nav>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <SubjectBadge
              name={note.subjectName}
              color={note.subjectColor}
              icon={note.subjectIcon}
              slug={note.subjectSlug}
            />
            <span className="font-medium text-primary">
              Лекция {note.number}
            </span>
            {note.lectureDate ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarIcon className="size-3.5" />
                {fmtDateOnly(note.lectureDate)}
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {note.title}
          </h1>
          {note.summary ? (
            <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
              {note.summary}
            </p>
          ) : null}
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-10 xl:grid-cols-[15rem_minmax(0,1fr)_15rem]">
          {hasOutline ? (
            <aside className="hidden xl:block">
              <div className="sticky top-24">
                <CourseOutline
                  notes={siblings}
                  currentId={note.id}
                  subject={outlineSubject}
                />
              </div>
            </aside>
          ) : null}
          <div className="min-w-0 space-y-8">
            {hasOutline ? (
              <CourseOutline
                notes={siblings}
                currentId={note.id}
                subject={outlineSubject}
                variant="inline"
                className="xl:hidden"
              />
            ) : null}
            <Toc items={rendered.toc} variant="inline" className="lg:hidden" />
            <div className="animate-fade-in">
              <MdxBody rendered={rendered} />
            </div>
            <NoteQuizzes quizzes={note.quizzes} />
            <NoteNav prev={note.prev} next={note.next} />
          </div>
          <aside
            className={
              hasOutline ? "hidden lg:block" : "hidden lg:block xl:col-start-3"
            }
          >
            <div className="sticky top-24 space-y-6">
              <Toc items={rendered.toc} />
              {note.quizzes.length > 0 ? (
                <div className="border-t pt-4">
                  <a
                    href="#quiz"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <SparklesIcon className="size-3.5" />
                    Проверь себя
                  </a>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </article>
    </>
  );
}
