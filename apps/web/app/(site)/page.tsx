import {
  BookOpenTextIcon,
  ChevronRightIcon,
  FileTextIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ScopeSwitch } from "@/components/site/audience/scope-switch";
import { DeadlineList } from "@/components/site/deadline-list";
import { EmptyState } from "@/components/site/empty-state";
import { Hero } from "@/components/site/home/hero";
import { MySignups } from "@/components/site/home/my-signups";
import { FadeIn, Stagger, StaggerItem } from "@/components/site/motion";
import { Section } from "@/components/site/section";
import { SubjectBadge } from "@/components/site/subject-badge";
import { SubjectCard } from "@/components/site/subjects/subject-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { getHome, getPages } from "@/lib/api/public";
import { getViewerScope } from "@/lib/api/viewer";
import { fmtDateOnly, plural } from "@/lib/format";
import { DEFAULT_DESCRIPTION, pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  let title = "М3105 — учебный сайт";
  let description = DEFAULT_DESCRIPTION;
  try {
    const { settings } = await getHome();
    title = `${settings.siteTitle || "М3105"} — учебный сайт`;
    description = settings.description || DEFAULT_DESCRIPTION;
  } catch {
    // keep defaults
  }
  return pageMetadata({
    title,
    absolute: true,
    description,
    path: "/",
    markdown: true,
  });
}

/** How many useful pages the home page lists; the rest are on /p. */
const HOME_PAGES = 5;

export default async function HomePage() {
  const scope = await getViewerScope();
  const [home, pages] = await Promise.all([
    getHome(scope.forGroup),
    getPages().catch(() => []),
  ]);
  const tz = home.settings.timezone;

  return (
    <div className="space-y-10 sm:space-y-12">
      <div className="space-y-3">
        <Hero
          settings={home.settings}
          week={home.week}
          now={home.now}
          group={scope.group}
        />
        <ScopeSwitch group={scope.group} all={scope.all} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
        <div className="space-y-8 lg:col-span-2">
          <FadeIn delay={0.1}>
            <Section
              title="Ближайшие дедлайны"
              description="Лабораторные на три недели вперёд"
              href="/calendar"
              hrefLabel="Календарь"
            >
              <DeadlineList
                items={home.upcomingDeadlines}
                now={home.now}
                tz={tz}
                emptyTitle="Ближайших дедлайнов нет"
                emptyDescription="Можно выдохнуть. Полный список — в календаре."
              />
            </Section>
          </FadeIn>

          {home.upcomingEvents.length > 0 ? (
            <FadeIn delay={0.13}>
              <Section
                title="События"
                description="Контрольные, экзамены, консультации и сдачи"
              >
                <DeadlineList
                  items={home.upcomingEvents}
                  now={home.now}
                  tz={tz}
                  emptyTitle="Событий нет"
                />
              </Section>
            </FadeIn>
          ) : null}

          {home.overdueDeadlines.length > 0 ? (
            <FadeIn delay={0.15}>
              <Accordion className="rounded-xl border border-destructive/30 bg-destructive/5 px-4">
                <AccordionItem value="overdue" className="border-none">
                  <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                    <span className="inline-flex items-center gap-2">
                      <TriangleAlertIcon
                        className="size-4 text-destructive"
                        aria-hidden
                      />
                      Прошедшие дедлайны: {home.overdueDeadlines.length}{" "}
                      {plural(
                        home.overdueDeadlines.length,
                        "лаба",
                        "лабы",
                        "лаб",
                      )}{" "}
                      за две недели
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="[&_a]:no-underline pb-4">
                    <DeadlineList
                      items={home.overdueDeadlines}
                      now={home.now}
                      tz={tz}
                      compact
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </FadeIn>
          ) : null}
        </div>

        <div className="space-y-8 lg:col-span-1">
          <FadeIn delay={0.12}>
            <MySignups tz={tz} now={home.now} />
          </FadeIn>
          <FadeIn delay={0.15}>
            <Section title="Свежие конспекты" href="/notes">
              {home.recentNotes.length === 0 ? (
                <EmptyState
                  icon={BookOpenTextIcon}
                  title="Конспектов пока нет"
                  className="py-8"
                />
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {home.recentNotes.map((n) => (
                    <li key={n.id}>
                      <Link
                        href={`/notes/${n.subjectSlug}/${n.slug}`}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                      >
                        <BookOpenTextIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {n.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <SubjectBadge
                              name={n.subjectShortName || n.subjectName}
                              color={n.subjectColor}
                            />
                            {n.lectureDate ? (
                              <span>{fmtDateOnly(n.lectureDate)}</span>
                            ) : null}
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
          </FadeIn>
          {pages.length > 0 ? (
            <FadeIn delay={0.18}>
              <Section title="Полезное" href="/p">
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {pages.slice(0, HOME_PAGES).map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/p/${p.slug}`}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                      >
                        <FileTextIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {p.title}
                          </div>
                          {p.category ? (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {p.category}
                            </div>
                          ) : null}
                        </div>
                        <ChevronRightIcon
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </FadeIn>
          ) : null}
        </div>
      </div>

      <Section
        title="Предметы"
        description="Лабы, конспекты и квизы по каждому предмету"
        href="/subjects"
      >
        {home.subjects.length === 0 ? (
          <EmptyState
            title="Предметов пока нет"
            description="Список появится, как только его заполнят в админке."
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {home.subjects.map((s) => (
              <StaggerItem key={s.id} className="h-full">
                <SubjectCard subject={s} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Section>
    </div>
  );
}
