import {
  ArrowLeftIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ListOrderedIcon,
  PaperclipIcon,
  SendIcon,
  ShuffleIcon,
  TrophyIcon,
  UserRoundIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { breadcrumbs, JsonLd } from "@/components/site/json-ld";
import { DeadlineCard } from "@/components/site/labs/deadline-card";
import { MdxContent } from "@/components/site/mdx-content";
import { FadeIn } from "@/components/site/motion";
import { SubjectBadge } from "@/components/site/subject-badge";
import { isNotFound } from "@/lib/api/client";
import { getLab, getSettings } from "@/lib/api/public";
import type { Lab } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { absoluteUrl, metaText, pageMetadata, SITE_NAME } from "@/lib/seo";
import { cn } from "@/lib/utils";

type Params = { params: Promise<{ subject: string; slug: string }> };

async function load(subject: string, slug: string): Promise<Lab> {
  try {
    return await getLab(subject, slug);
  } catch (err) {
    if (isNotFound(err)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { subject, slug } = await params;
  try {
    const lab = await getLab(subject, slug);
    return pageMetadata({
      title: `Лаба ${lab.number}. ${lab.title}`,
      description:
        metaText(lab.summary) ||
        `${lab.subjectName}: лабораторная работа ${lab.number}. Задание, требования и порядок сдачи.`,
      path: `/labs/${lab.subjectSlug}/${lab.slug}`,
      type: "article",
      publishedTime: lab.createdAt,
      modifiedTime: lab.updatedAt,
      section: lab.subjectName,
      tags: [lab.subjectName, "лабораторная"],
    });
  } catch {
    return { title: "Лабораторная", robots: { index: false } };
  }
}

const SECTIONS: {
  key: keyof Pick<Lab, "content" | "requirements" | "submission" | "variants">;
  id: string;
  title: string;
  icon: typeof FileTextIcon;
}[] = [
  { key: "content", id: "task", title: "Задание", icon: FileTextIcon },
  {
    key: "requirements",
    id: "requirements",
    title: "Требования",
    icon: ClipboardListIcon,
  },
  { key: "submission", id: "submission", title: "Как сдавать", icon: SendIcon },
  { key: "variants", id: "variants", title: "Варианты", icon: ShuffleIcon },
];

export default async function LabPage({ params }: Params) {
  const { subject, slug } = await params;
  const [lab, site] = await Promise.all([load(subject, slug), getSettings()]);
  const tz = site.settings.timezone;
  const sections = SECTIONS.filter((s) => lab[s.key]?.trim());
  const hasMaterials = lab.materials.length > 0;

  const labUrl = absoluteUrl(`/labs/${lab.subjectSlug}/${lab.slug}`);

  return (
    <article className="space-y-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: `Лаба ${lab.number}. ${lab.title}`,
          description: metaText(lab.summary) || undefined,
          url: labUrl,
          inLanguage: "ru",
          datePublished: lab.createdAt,
          dateModified: lab.updatedAt,
          articleSection: lab.subjectName,
          author: { "@type": "Organization", name: SITE_NAME },
          publisher: { "@type": "Organization", name: SITE_NAME },
          isPartOf: {
            "@type": "Course",
            name: lab.subjectName,
            url: absoluteUrl(`/subjects/${lab.subjectSlug}`),
          },
        }}
      />
      <JsonLd
        data={breadcrumbs([
          { name: "Лабораторные", url: absoluteUrl("/labs") },
          {
            name: lab.subjectName,
            url: absoluteUrl(`/subjects/${lab.subjectSlug}`),
          },
          { name: `Лаба ${lab.number}. ${lab.title}`, url: labUrl },
        ])}
      />
      <div className="animate-rise space-y-4">
        <Link
          href={`/subjects/${lab.subjectSlug}#labs`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {lab.subjectName}
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SubjectBadge
              name={lab.subjectShortName || lab.subjectName}
              color={lab.subjectColor}
              slug={lab.subjectSlug}
              size="md"
            />
            <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium">
              Лаба {lab.number}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {lab.title}
          </h1>
          {lab.summary ? (
            <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
              {lab.summary}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {lab.teacher ? (
            <span className="inline-flex items-center gap-1.5">
              <UserRoundIcon className="size-4" aria-hidden />
              {lab.teacher}
            </span>
          ) : null}
          {lab.maxScore != null ? (
            <span className="inline-flex items-center gap-1.5">
              <TrophyIcon className="size-4" aria-hidden />
              до {lab.maxScore}{" "}
              {plural(lab.maxScore, "балла", "баллов", "баллов")}
            </span>
          ) : null}
        </div>
      </div>

      <FadeIn delay={0.05}>
        <DeadlineCard
          labId={lab.id}
          subjectSlug={lab.subjectSlug}
          deadlineAt={lab.deadlineAt}
          deadlineNote={lab.deadlineNote}
          now={site.now}
          tz={tz}
        />
      </FadeIn>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
        <div className="min-w-0 space-y-10">
          {sections.length === 0 && !hasMaterials ? (
            <p className="text-muted-foreground">
              Описание задания появится позже.
            </p>
          ) : null}
          {sections.map((s, i) => (
            <FadeIn key={s.id} delay={0.08 + i * 0.05}>
              <section id={s.id} className="scroll-mt-24 space-y-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  <s.icon className="size-5 text-primary" aria-hidden />
                  {s.title}
                </h2>
                <MdxContent source={lab[s.key]} />
              </section>
            </FadeIn>
          ))}
          {hasMaterials ? (
            <FadeIn delay={0.1 + sections.length * 0.05}>
              <section id="materials" className="scroll-mt-24 space-y-4">
                <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  <PaperclipIcon className="size-5 text-primary" aria-hidden />
                  Материалы
                </h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {lab.materials.map((m) => (
                    <li key={m.url}>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent/40"
                      >
                        <span className="truncate">{m.title}</span>
                        <ExternalLinkIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </FadeIn>
          ) : null}
        </div>

        {sections.length + (hasMaterials ? 1 : 0) > 1 ? (
          <aside className="hidden lg:block">
            <nav
              aria-label="Содержание"
              className="sticky top-24 space-y-1 rounded-xl border bg-card p-3 text-sm"
            >
              <div className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <ListOrderedIcon className="size-3.5" aria-hidden />
                Содержание
              </div>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={cn(
                    "block rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  )}
                >
                  {s.title}
                </a>
              ))}
              {hasMaterials ? (
                <a
                  href="#materials"
                  className="block rounded-lg px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Материалы
                </a>
              ) : null}
            </nav>
          </aside>
        ) : null}
      </div>
    </article>
  );
}
