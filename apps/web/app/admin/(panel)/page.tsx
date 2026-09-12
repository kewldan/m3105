"use client";

import {
  BookOpenIcon,
  CalendarClockIcon,
  CircleQuestionMarkIcon,
  ClipboardCheckIcon,
  FileTextIcon,
  FlaskConicalIcon,
  ListChecksIcon,
  type LucideIcon,
  NotebookPenIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

import { PageTitle } from "@/components/admin/page-title";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { OverviewResponse } from "@/lib/api/types";
import { EVENT_KIND_LABEL, fmtDateTime, fmtRelative } from "@/lib/format";

type Stat = {
  key: keyof OverviewResponse;
  label: string;
  href: string;
  icon: LucideIcon;
  hint?: (o: OverviewResponse) => string | null;
};

const STATS: Stat[] = [
  {
    key: "subjects",
    label: "Предметы",
    href: "/admin/subjects",
    icon: BookOpenIcon,
  },
  {
    key: "labs",
    label: "Лабы",
    href: "/admin/labs",
    icon: FlaskConicalIcon,
    hint: (o) => (o.labsDraft > 0 ? `черновиков: ${o.labsDraft}` : null),
  },
  {
    key: "events",
    label: "События",
    href: "/admin/events",
    icon: CalendarClockIcon,
  },
  {
    key: "practice",
    label: "Сдачи",
    href: "/admin/practice",
    icon: ClipboardCheckIcon,
    hint: (o) => (o.practice > 0 ? "ближайшие" : "ближайших нет"),
  },
  {
    key: "notes",
    label: "Конспекты",
    href: "/admin/notes",
    icon: NotebookPenIcon,
  },
  {
    key: "quizzes",
    label: "Квизы",
    href: "/admin/quizzes",
    icon: ListChecksIcon,
  },
  {
    key: "faq",
    label: "Вопросы ЧаВо",
    href: "/admin/faq",
    icon: CircleQuestionMarkIcon,
  },
  { key: "pages", label: "Страницы", href: "/admin/pages", icon: FileTextIcon },
  { key: "users", label: "Студенты", href: "/admin/users", icon: UsersIcon },
];

const QUICK = [
  { label: "Новая лаба", href: "/admin/labs/new" },
  { label: "Новый конспект", href: "/admin/notes/new" },
  { label: "Новый квиз", href: "/admin/quizzes/new" },
  { label: "Событие", href: "/admin/events?new=1" },
  { label: "Сдача", href: "/admin/practice?new=1" },
];

export default function AdminOverviewPage() {
  const { data, loading, error } = useQuery(() => adminApi.overview());

  return (
    <>
      <PageTitle
        title="Обзор"
        description="Сводка по контенту сайта и ближайшие дедлайны."
        actions={QUICK.map((q) => (
          <Button
            key={q.href}
            variant="outline"
            size="sm"
            render={<Link href={q.href} />}
          >
            <PlusIcon data-icon="inline-start" />
            {q.label}
          </Button>
        ))}
      />

      {error ? (
        <p className="text-sm text-destructive">
          Не удалось загрузить сводку: {error.message}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATS.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{s.label}</span>
              <s.icon className="size-4 transition-colors group-hover:text-primary" />
            </div>
            <div className="mt-2 font-heading text-2xl font-semibold tabular-nums">
              {loading || !data ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                String(data[s.key] ?? 0)
              )}
            </div>
            {data && s.hint?.(data) ? (
              <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                {s.hint(data)}
              </div>
            ) : null}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ближайшие 30 дней</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !data ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-3/5" />
            </div>
          ) : data.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Дедлайнов и событий на ближайший месяц нет.
            </p>
          ) : (
            <ul className="divide-y">
              {data.upcoming.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
                >
                  <span className="w-40 shrink-0 text-muted-foreground tabular-nums">
                    {fmtDateTime(item.startsAt)}
                  </span>
                  <Badge
                    variant={item.source === "lab" ? "default" : "secondary"}
                  >
                    {EVENT_KIND_LABEL[item.kind] ?? item.kind}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {item.title}
                  </span>
                  {item.subject ? (
                    <SubjectBadge
                      name={item.subject.shortName || item.subject.name}
                      color={item.subject.color}
                    />
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {fmtRelative(item.startsAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
