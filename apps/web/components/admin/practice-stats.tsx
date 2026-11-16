"use client";

import { ClipboardCheckIcon } from "lucide-react";

import { fmtMinutes } from "@/components/admin/practice-results";
import { AudienceBadge } from "@/components/site/audience/audience-badge";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PracticeStatsSubject,
  Throughput,
  ThroughputSummary,
} from "@/lib/api/types";
import { fmtDateTime, fmtTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmtMedian(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
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
          Нет прошедших сдач с отметками.
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
          Обычно успевают{" "}
          <span className="text-foreground tabular-nums">
            {fmtMedian(sum.attempts)}
          </span>
          , принимают{" "}
          <span className="text-foreground tabular-nums">
            {fmtMedian(sum.passed)}
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
            : `Очередь разбирали полностью (${sum.sessions} ${plural(sum.sessions, "сдача", "сдачи", "сдач")}) — оценка по темпу`}
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
  if (t.attempts === 0 && t.signedUp === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const failed = t.attempts - t.passed;
  return (
    <div className="tabular-nums">
      <div>
        <span title="Приняли">{t.passed} ✓</span>
        {failed > 0 ? (
          <span className="text-destructive" title="Не приняли">
            {" "}
            · {failed} ✗
          </span>
        ) : null}
        <span className="text-muted-foreground"> из {t.signedUp}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {t.minutesEach != null ? `≈${fmtMinutes(t.minutesEach)} мин` : ""}
        {t.left > 0
          ? `${t.minutesEach != null ? " · " : ""}не дошли ${t.left}`
          : ""}
        {t.last && t.minutesEach == null ? `до ${fmtTime(t.last)}` : ""}
      </div>
    </div>
  );
}

/** Сколько защит и теорминов принимают за пару — по отметкам на сдачах. */
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
          <EmptyTitle>Отметок пока нет</EmptyTitle>
          <EmptyDescription>
            Во время пары откройте «Участники» у сдачи и отмечайте ✓ или ✗,
            когда человеку поставили оценку за лабу или теормин. Здесь появится,
            сколько успевают принять за пару и какой лимит ставить.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="space-y-4">
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
                отметками. Оценка — медиана по прошедшим.
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
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Сдача</TableHead>
                      <TableHead className="text-right">Лимит</TableHead>
                      <TableHead>Защиты</TableHead>
                      {s.theoryMin ? <TableHead>Теормин</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.sessions.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell className="align-top">
                          <div className="tabular-nums">
                            {fmtDateTime(x.startsAt)}
                            <span className="text-muted-foreground">
                              {" "}
                              · {x.minutes} мин
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            {x.location ? (
                              <span className="text-xs text-muted-foreground">
                                {x.location}
                              </span>
                            ) : null}
                            <AudienceBadge audience={x.audience} />
                            {x.finished ? null : (
                              <Badge variant="outline">идёт</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">
                          {x.capacity ?? "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <ThroughputCell t={x.labs} />
                        </TableCell>
                        {s.theoryMin ? (
                          <TableCell className="align-top">
                            <ThroughputCell t={x.theory} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
