"use client";

import { ChevronDownIcon, ClipboardCheckIcon } from "lucide-react";

import { AudienceBadge } from "@/components/site/audience/audience-badge";
import { GroupBadge } from "@/components/site/group-badge";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  PracticeChange,
  PracticeStatsSession,
  PracticeStatsSubject,
  Throughput,
  ThroughputSummary,
} from "@/lib/api/types";
import { fmtDateTime, fmtTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

function fmtMinutes(m: number): string {
  return m < 10 ? fmtNumber(Math.round(m * 10) / 10) : String(Math.round(m));
}

function SummaryBlock({
  title,
  unit,
  sum,
  capacity,
}: {
  title: string;
  /** «защиту», «теормин» — на что минуты. */
  unit: string;
  sum: ThroughputSummary;
  /** Лимит последней сдачи; только для защит. */
  capacity?: number | null;
}) {
  if (sum.sessions === 0) {
    return (
      <div className="rounded-xl border border-dashed p-3">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Пока ни одной прошедшей сдачи с оценками в таблице.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        {sum.suggested != null ? (
          <div className="text-right">
            <span className="font-heading text-2xl font-semibold tabular-nums">
              ~{sum.suggested}
            </span>
            <span className="text-xs text-muted-foreground"> за пару</span>
          </div>
        ) : null}
      </div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        <li>
          Обычно принимают{" "}
          <span className="text-foreground tabular-nums">
            {fmtNumber(sum.graded)}
          </span>
          , максимум <span className="tabular-nums">{sum.max}</span>
        </li>
        {sum.minutesEach != null ? (
          <li>
            ≈{fmtMinutes(sum.minutesEach)} мин на {unit}
          </li>
        ) : null}
        <li>
          {sum.busy > 0
            ? `Не все успели на ${sum.busy} из ${sum.sessions} ${plural(sum.sessions, "сдачи", "сдач", "сдач")} — оценка по ним`
            : sum.suggested != null
              ? `Записавшихся каждый раз принимали всех (${sum.sessions} ${plural(sum.sessions, "сдача", "сдачи", "сдач")}) — оценка по темпу`
              : "Оценки вносили после пары — темпа нет, лимит оценить не по чему"}
        </li>
        {capacity !== undefined ? (
          <li>
            Лимит на последней сдаче:{" "}
            <span className="text-foreground">{capacity ?? "не задан"}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ThroughputCell({ t }: { t: Throughput }) {
  if (t.graded === 0 && t.signedUp === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const later = t.graded - t.inSession;
  return (
    <div className="tabular-nums">
      <div>
        {t.graded}
        <span className="text-muted-foreground"> из {t.signedUp} записей</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {[
          t.minutesEach != null ? `≈${fmtMinutes(t.minutesEach)} мин` : "",
          later > 0 ? `после пары ${later}` : "",
          t.left > 0 ? `не дошли ~${t.left}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

/** Когда синк увидел изменение; при редких синках — промежуток. */
function changeTime(c: PracticeChange): string {
  if (!c.prevSyncAt) return fmtTime(c.detectedAt);
  const prev = new Date(c.prevSyncAt).getTime();
  const seen = new Date(c.detectedAt).getTime();
  // Во время пары синки идут каждые 2 минуты: точности до минуты хватает.
  if (seen - prev <= 5 * 60_000) return fmtTime(c.detectedAt);
  return `${fmtDateTime(c.prevSyncAt)} — ${fmtTime(c.detectedAt)}`;
}

function SessionRow({
  s,
  theoryMin,
}: {
  s: PracticeStatsSession;
  theoryMin: boolean;
}) {
  return (
    <Collapsible className="border-b last:border-b-0">
      <CollapsibleTrigger className="group flex w-full flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2.5 text-left text-sm hover:bg-muted/40">
        <div className="min-w-44 flex-1">
          <div className="flex items-center gap-1.5 tabular-nums">
            <ChevronDownIcon
              className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden
            />
            {fmtDateTime(s.startsAt)}
            <span className="text-muted-foreground">· {s.minutes} мин</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 pt-0.5 pl-5.5">
            <span className="text-xs text-muted-foreground">
              лимит {s.capacity ?? "—"}
              {s.location ? ` · ${s.location}` : ""}
            </span>
            <AudienceBadge audience={s.audience} />
            {s.finished ? null : <Badge variant="outline">идёт</Badge>}
          </div>
        </div>
        <div className="w-36">
          <div className="text-xs text-muted-foreground">Защиты</div>
          <ThroughputCell t={s.labs} />
        </div>
        {theoryMin ? (
          <div className="w-36">
            <div className="text-xs text-muted-foreground">Теормин</div>
            <ThroughputCell t={s.theory} />
          </div>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y border-t bg-muted/20">
          {s.changes.map((c) => (
            <li
              key={`${c.kind}:${c.name}:${c.part}`}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm",
                !c.inSession && "text-muted-foreground",
              )}
            >
              <span className="min-w-12 shrink-0 text-xs whitespace-nowrap tabular-nums text-muted-foreground">
                {changeTime(c)}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate">{c.name}</span>
                <GroupBadge group={c.group} />
              </span>
              <span className="shrink-0 text-right text-xs">
                {c.kind === "theory" ? `Теормин · ${c.label}` : c.label}
                {c.inSession ? "" : " · после пары"}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Сколько защит и теорминов принимают за пару — по таблице баллов: во время
 * сдачи она синкается каждые 2 минуты, и появление оценки попадает в журнал.
 */
export function PracticeStats({
  data,
  loading,
}: {
  data: PracticeStatsSubject[] | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Empty className="border border-dashed py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Оценок с пар пока нет</EmptyTitle>
          <EmptyDescription>
            Во время сдачи таблица баллов предмета синкается каждые 2 минуты.
            Как только в ней появится приём лабы (ступень, плюсы, минусы) или
            баллы за теормин, здесь будет видно, кому и когда поставили, сколько
            успевают за пару и какой лимит ставить.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        По таблицам баллов: во время сдачи таблица предмета синкается каждые 2
        минуты, время оценки — когда синк её увидел. Оценка относится к
        последней сдаче предмета для группы студента за неделю; внесённые позже
        чем через 30 минут после пары считаются, но в темп не идут.
      </p>
      {data.map((s) => {
        const lastFinished = s.sessions.find((x) => x.finished);
        return (
          <Card key={s.subjectId}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SubjectBadge
                  name={s.subjectShortName || s.subjectName}
                  color={s.subjectColor}
                />
                <span className="truncate">{s.subjectName}</span>
              </CardTitle>
              <CardDescription>
                {s.sessions.length}{" "}
                {plural(s.sessions.length, "сдача", "сдачи", "сдач")} с
                оценками. Лимит — медиана по прошедшим; нажмите на сдачу, чтобы
                увидеть, кому и когда поставили.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className={cn("grid gap-3", s.theoryMin && "sm:grid-cols-2")}
              >
                <SummaryBlock
                  title="Защиты лаб"
                  unit="защиту"
                  sum={s.labs}
                  capacity={lastFinished ? lastFinished.capacity : undefined}
                />
                {s.theoryMin ? (
                  <SummaryBlock title="Теормин" unit="теормин" sum={s.theory} />
                ) : null}
              </div>
              <div className="overflow-hidden rounded-xl border">
                {s.sessions.map((x) => (
                  <SessionRow key={x.id} s={x} theoryMin={s.theoryMin} />
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
