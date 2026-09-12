import {
  BookOpenTextIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  UserRoundIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeadlineBadge } from "@/components/site/deadline-badge";
import { EmptyState } from "@/components/site/empty-state";
import { breadcrumbs, JsonLd } from "@/components/site/json-ld";
import { MdxContent } from "@/components/site/mdx-content";
import { FadeIn } from "@/components/site/motion";
import { Section } from "@/components/site/section";
import { SubjectIcon } from "@/components/site/subject-icon";
import { isNotFound } from "@/lib/api/client";
import { getSettings, getSubject } from "@/lib/api/public";
import type { SubjectResponse } from "@/lib/api/types";
import { fmtDateOnly, fmtDateTime, plural } from "@/lib/format";
import { absoluteUrl, metaText, pageMetadata, SITE_NAME } from "@/lib/seo";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

type Params = { params: Promise<{ slug: string }> };

const NOTES_PREVIEW = 12;

async function load(slug: string): Promise<SubjectResponse> {
  try {
    return await getSubject(slug);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { subject, labs, notes } = await getSubject(slug);
    const bits = [
      subject.teacher ? `Преподаватель: ${subject.teacher}.` : "",
      labs.length
        ? `${labs.length} ${plural(labs.length, "лаба", "лабы", "лаб")}`
        : "",
      notes.length
        ? `${notes.length} ${plural(notes.length, "конспект", "конспекта", "конспектов")}`
        : "",
    ].filter(Boolean);
    return pageMetadata({
      title: subject.name,
      description:
        metaText(subject.description, 120) ||
        (bits.length
          ? bits.join(", ")
          : `${subject.name}: лабораторные, конспекты и квизы.`),
      path: `/subjects/${subject.slug}`,
    });
  } catch {
    return { title: "Предмет", robots: { index: false } };
  }
}

export default async function SubjectPage({ params }: Params) {
  const { slug } = await params;
  const [data, site] = await Promise.all([load(slug), getSettings()]);
  const { subject, labs, notes } = data;
  const tz = site.settings.timezone;
  const c = subjectColor(subject.color);
  // Long courses get a preview here and the full, searchable list on /notes.
  const recentNotes = [...notes]
    .sort((a, b) => b.number - a.number)
    .slice(0, NOTES_PREVIEW)
    .reverse();

  const subjectUrl = absoluteUrl(`/subjects/${subject.slug}`);

  return (
    <div className="space-y-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Course",
          name: subject.name,
          description:
            metaText(subject.description, 200) ||
            `${subject.name}: лабораторные, конспекты и квизы.`,
          url: subjectUrl,
          inLanguage: "ru",
          provider: { "@type": "Organization", name: SITE_NAME },
          ...(subject.teacher
            ? { instructor: { "@type": "Person", name: subject.teacher } }
            : {}),
        }}
      />
      <JsonLd
        data={breadcrumbs([
          { name: "Предметы", url: absoluteUrl("/subjects") },
          { name: subject.name, url: subjectUrl },
        ])}
      />
      <div className="animate-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <SubjectIcon
            icon={subject.icon}
            color={subject.color}
            size="lg"
            className="mt-0.5"
          />
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium text-primary">
              Предмет{subject.shortName ? ` · ${subject.shortName}` : ""}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {subject.name}
            </h1>
            {subject.teacher ? (
              <p className="inline-flex items-center gap-1.5 text-base text-muted-foreground">
                <UserRoundIcon className="size-4" aria-hidden />
                {subject.teacher}
              </p>
            ) : null}
          </div>
        </div>
        {subject.links.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {subject.links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                {l.title}
                <ExternalLinkIcon
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {subject.description ? (
        <FadeIn>
          <div className={cn("rounded-2xl border p-5 sm:p-6", c.soft)}>
            <MdxContent source={subject.description} />
          </div>
        </FadeIn>
      ) : null}

      <Section
        id="labs"
        title="Лабораторные"
        description={`${labs.length} ${plural(labs.length, "работа", "работы", "работ")}`}
      >
        {labs.length === 0 ? (
          <EmptyState
            icon={FlaskConicalIcon}
            title="Лаб пока нет"
            className="py-8"
          />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {labs.map((lab) => (
              <li key={lab.id}>
                <Link
                  href={`/labs/${lab.subjectSlug}/${lab.slug}`}
                  className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-sm font-semibold">
                    {lab.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{lab.title}</div>
                    {lab.summary ? (
                      <div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {lab.summary}
                      </div>
                    ) : null}
                    {lab.deadlineAt ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Дедлайн: {fmtDateTime(lab.deadlineAt, tz)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <DeadlineBadge
                      deadlineAt={lab.deadlineAt}
                      now={site.now}
                      tz={tz}
                    />
                    <ChevronRightIcon
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2">
        <Section
          id="notes"
          title="Конспекты"
          description={`${notes.length} ${plural(notes.length, "лекция", "лекции", "лекций")}${notes.length > NOTES_PREVIEW ? `, показаны последние ${NOTES_PREVIEW}` : ""}`}
          href={
            notes.length > NOTES_PREVIEW
              ? `/notes?subject=${encodeURIComponent(subject.slug)}`
              : undefined
          }
          hrefLabel="Все лекции"
        >
          {notes.length === 0 ? (
            <EmptyState
              icon={BookOpenTextIcon}
              title="Конспектов пока нет"
              className="py-8"
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.subjectSlug}/${n.slug}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-xs font-semibold">
                      {n.number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {n.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {n.lectureDate ? fmtDateOnly(n.lectureDate) : n.summary}
                      </div>
                    </div>
                    <ChevronRightIcon
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
