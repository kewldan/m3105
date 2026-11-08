"use client";

import {
  BanIcon,
  EllipsisIcon,
  PlusIcon,
  RepeatIcon,
  RotateCcwIcon,
  UndoIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { ParticipantsDialog } from "@/components/admin/participants-dialog";
import { PracticeCancelDialog } from "@/components/admin/practice-cancel-dialog";
import { PracticeDialog } from "@/components/admin/practice-dialog";
import { PracticeRuleDialog } from "@/components/admin/practice-rule-dialog";
import { RowActions } from "@/components/admin/row-actions";
import { AudienceBadge } from "@/components/site/audience/audience-badge";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { PracticeRule, PracticeSession } from "@/lib/api/types";
import {
  fmtDateOnly,
  fmtDateTime,
  fmtRelative,
  fmtTime,
  WEEKDAYS_SHORT,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Tab = "sessions" | "rules";

function shiftWeek(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + WEEK_MS).toISOString();
}

function endOf(s: PracticeSession): number {
  return new Date(s.endsAt ?? s.startsAt).getTime();
}

function sameAudience(a: string[], b: string[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}

/** «Пн 20:30–22:00, нечётные недели». */
export function ruleSchedule(r: PracticeRule): string {
  let s = `${WEEKDAYS_SHORT[r.weekday - 1]} ${r.startTime}`;
  if (r.endTime) s += `–${r.endTime}`;
  if (r.weeks === "odd") s += ", нечётные недели";
  if (r.weeks === "even") s += ", чётные недели";
  return s;
}

function PracticePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = searchParams.get("tab") === "rules" ? "rules" : "sessions";
  const ruleFilter = Number(searchParams.get("rule")) || null;
  const setView = (next: Tab, rule: number | null = null) => {
    const qs = new URLSearchParams();
    if (next === "rules") qs.set("tab", "rules");
    if (rule) qs.set("rule", String(rule));
    const q = qs.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const subjects = useQuery(() => adminApi.subjects.list());
  const sessions = useQuery(() => adminApi.practice.list());
  const rules = useQuery(() => adminApi.practiceRules.list());
  const reloadAll = () => {
    sessions.reload();
    rules.reload();
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeSession | null>(null);
  const [deleting, setDeleting] = useState<PracticeSession | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [participantsFor, setParticipantsFor] =
    useState<PracticeSession | null>(null);
  const [cancelling, setCancelling] = useState<PracticeSession | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PracticeRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<PracticeRule | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
    }
  }, [searchParams]);

  const rulesById = useMemo(
    () => new Map((rules.data ?? []).map((r) => [r.id, r])),
    [rules.data],
  );
  const filterRule = ruleFilter ? (rulesById.get(ruleFilter) ?? null) : null;

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const all = (sessions.data ?? []).filter(
      (s) => !ruleFilter || s.ruleId === ruleFilter,
    );
    return {
      upcoming: all
        .filter((s) => endOf(s) >= now)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      past: all
        .filter((s) => endOf(s) < now)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    };
  }, [sessions.data, ruleFilter]);

  // Куда переедут записи отменённого занятия: следующая сдача предмета для той же аудитории.
  const nextAfter = (s: PracticeSession | null): PracticeSession | null => {
    if (!s) return null;
    return (
      (sessions.data ?? [])
        .filter(
          (x) =>
            x.id !== s.id &&
            x.subjectId === s.subjectId &&
            !x.canceled &&
            x.startsAt > s.startsAt &&
            sameAudience(x.audience, s.audience),
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
    );
  };

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.practice.remove(deleting.id);
      toast.success("Сдача удалена");
      setDeleting(null);
      reloadAll();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDeleteRule() {
    if (!deletingRule) return;
    setDeleteLoading(true);
    try {
      await adminApi.practiceRules.remove(deletingRule.id);
      toast.success("Правило удалено");
      setDeletingRule(null);
      if (ruleFilter === deletingRule.id) setView("sessions");
      reloadAll();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function act(fn: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await fn();
      toast.success(done);
      reloadAll();
    } catch (err) {
      handleApiError(err);
    }
  }

  async function duplicate(s: PracticeSession) {
    try {
      await adminApi.practice.create({
        subjectId: s.subjectId,
        startsAt: shiftWeek(s.startsAt) ?? s.startsAt,
        endsAt: shiftWeek(s.endsAt),
        location: s.location,
        capacity: s.capacity,
        note: s.note,
        audience: s.audience,
      });
      toast.success("Сдача продублирована на неделю вперёд");
      sessions.reload();
    } catch (err) {
      handleApiError(err);
    }
  }

  const columns = (isPast: boolean): Column<PracticeSession>[] => [
    {
      id: "starts",
      header: "Дата",
      sort: (r) => r.startsAt,
      className: "tabular-nums",
      cell: (r) => (
        <div className={cn((isPast || r.canceled) && "text-muted-foreground")}>
          <div className={cn(r.canceled && "line-through")}>
            {fmtDateTime(r.startsAt)}
            {r.endsAt ? (
              <span className="text-muted-foreground">
                {" "}
                — {fmtTime(r.endsAt)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1 pt-0.5 text-xs text-muted-foreground">
            {fmtRelative(r.startsAt)}
            {r.canceled ? (
              <Badge variant="destructive" title={r.cancelReason || undefined}>
                Отменено{r.cancelReason ? `: ${r.cancelReason}` : ""}
              </Badge>
            ) : null}
            {r.ruleId ? (
              <Badge
                variant="outline"
                title={
                  rulesById.get(r.ruleId)
                    ? ruleSchedule(rulesById.get(r.ruleId) as PracticeRule)
                    : undefined
                }
              >
                <RepeatIcon />
                {r.overridden ? "изменено вручную" : "по правилу"}
              </Badge>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: "subject",
      header: "Предмет",
      sort: (r) => r.subjectName,
      cell: (r) => (
        <div className="space-y-1">
          <SubjectBadge
            name={r.subjectShortName || r.subjectName}
            color={r.subjectColor}
          />
          <AudienceBadge audience={r.audience} className="text-[10px]" />
        </div>
      ),
    },
    {
      id: "location",
      header: "Место",
      sort: (r) => r.location,
      cell: (r) =>
        r.location || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "seats",
      header: "Места",
      sort: (r) => r.signupsCount,
      className: "tabular-nums whitespace-nowrap",
      cell: (r) => {
        const full = r.capacity != null && r.signupsCount >= r.capacity;
        return (
          <button
            type="button"
            onClick={() => setParticipantsFor(r)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-muted",
              full && "text-amber-600 dark:text-amber-400",
            )}
            aria-label="Показать участников"
          >
            <UsersIcon className="size-3.5" aria-hidden />
            {r.capacity != null ? (
              <>
                {r.signupsCount} / {r.capacity}
              </>
            ) : (
              <>
                {r.signupsCount}
                <span className="text-muted-foreground">· без лимита</span>
              </>
            )}
          </button>
        );
      },
    },
    {
      id: "note",
      header: "Заметка",
      className: "max-w-[20rem]",
      cell: (r) =>
        r.note ? (
          <span className="line-clamp-2 text-muted-foreground">{r.note}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setParticipantsFor(r)}
          >
            Участники
          </Button>
          <RowActions
            onEdit={() => {
              setEditing(r);
              setDialogOpen(true);
            }}
            onDuplicate={r.ruleId ? undefined : () => void duplicate(r)}
            onDelete={() => setDeleting(r)}
          />
          {isPast ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Ещё действия"
                  />
                }
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {r.canceled ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void act(
                        () => adminApi.practice.restore(r.id),
                        "Занятие снова в расписании",
                      )
                    }
                  >
                    <UndoIcon />
                    Вернуть занятие
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setCancelling(r)}
                  >
                    <BanIcon />
                    Отменить занятие…
                  </DropdownMenuItem>
                )}
                {r.ruleId && r.overridden ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void act(
                        () => adminApi.practice.reset(r.id),
                        "Занятие снова по правилу",
                      )
                    }
                  >
                    <RotateCcwIcon />
                    Вернуть к правилу
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ),
    },
  ];

  const ruleColumns: Column<PracticeRule>[] = [
    {
      id: "subject",
      header: "Предмет",
      sort: (r) => r.subjectName,
      cell: (r) => (
        <div className="space-y-1">
          <SubjectBadge
            name={r.subjectShortName || r.subjectName}
            color={r.subjectColor}
          />
          <AudienceBadge audience={r.audience} className="text-[10px]" />
        </div>
      ),
    },
    {
      id: "schedule",
      header: "Расписание",
      sort: (r) => r.weekday * 10000 + Number(r.startTime.replace(":", "")),
      cell: (r) => (
        <div>
          <div className="font-medium">{ruleSchedule(r)}</div>
          <div className="text-xs text-muted-foreground">
            {fmtDateOnly(r.startsOn)} — {fmtDateOnly(r.endsOn)}
          </div>
        </div>
      ),
    },
    {
      id: "place",
      header: "Место",
      cell: (r) => (
        <div className="text-sm">
          {r.location || <span className="text-muted-foreground">—</span>}
          <div className="text-xs text-muted-foreground">
            {r.capacity != null ? `${r.capacity} защит за пару` : "без лимита"}
          </div>
        </div>
      ),
    },
    {
      id: "next",
      header: "Ближайшие",
      className: "tabular-nums",
      cell: (r) =>
        r.next.length ? (
          <div className="text-sm">
            {r.next.map((n) => (
              <div key={n}>{fmtDateTime(n)}</div>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "count",
      header: "Занятия",
      sort: (r) => r.upcomingCount,
      className: "whitespace-nowrap",
      cell: (r) => (
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => setView("sessions", r.id)}
        >
          {r.upcomingCount} впереди
          {r.canceledCount > 0 ? `, ${r.canceledCount} отмен.` : ""}
        </Button>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <RowActions
          onEdit={() => {
            setEditingRule(r);
            setRuleDialogOpen(true);
          }}
          onDelete={() => setDeletingRule(r)}
        />
      ),
    },
  ];

  const addButtons = (size: "default" | "sm" = "default") => (
    <div className="flex flex-wrap gap-2">
      <Button
        size={size}
        onClick={() => {
          setEditingRule(null);
          setRuleDialogOpen(true);
        }}
      >
        <RepeatIcon data-icon="inline-start" />
        Регулярная сдача
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={() => {
          setEditing(null);
          setDialogOpen(true);
        }}
      >
        <PlusIcon data-icon="inline-start" />
        Разовая
      </Button>
    </div>
  );

  return (
    <>
      <PageTitle
        title="Сдачи"
        description="Занятия, на которые студенты записываются со сделанными лабами. Регулярные создаются по правилу сразу на весь период; отменить или перенести одно занятие — в его меню."
        actions={addButtons()}
      />

      <Tabs value={tab} onValueChange={(v) => setView(v as Tab)}>
        <TabsList>
          <TabsTrigger value="sessions">Занятия</TabsTrigger>
          <TabsTrigger value="rules">
            Правила
            {rules.data?.length ? (
              <span className="text-muted-foreground">{rules.data.length}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "rules" ? (
        <DataTable
          rows={rules.loading && !rules.data ? null : rules.data}
          loading={rules.loading}
          columns={ruleColumns}
          rowKey={(r) => r.id}
          emptyTitle="Регулярных сдач нет"
          emptyDescription="Правило вроде «каждый понедельник в 20:30» само создаст занятия на весь семестр, а разовые сдачи на его даты к нему привяжутся вместе с записями."
          emptyAction={addButtons("sm")}
        />
      ) : (
        <>
          {ruleFilter ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Только по правилу:</span>
              <Badge variant="secondary">
                {filterRule
                  ? `${filterRule.subjectShortName || filterRule.subjectName}, ${ruleSchedule(filterRule)}`
                  : `№${ruleFilter}`}
                <button
                  type="button"
                  aria-label="Показать все занятия"
                  onClick={() => setView("sessions")}
                  className="-mr-1 rounded-full hover:text-foreground"
                >
                  <XIcon />
                </button>
              </Badge>
            </div>
          ) : null}
          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">Ближайшие</h2>
            <DataTable
              rows={sessions.loading && !sessions.data ? null : upcoming}
              loading={sessions.loading}
              columns={columns(false)}
              rowKey={(r) => r.id}
              emptyTitle="Ближайших сдач нет"
              emptyDescription="Добавьте регулярную сдачу или разовое занятие, и студенты смогут записаться на него со страницы лабы."
              emptyAction={addButtons("sm")}
            />
          </section>

          {past.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-heading text-lg font-semibold text-muted-foreground">
                Прошедшие
              </h2>
              <DataTable
                rows={past}
                loading={false}
                columns={columns(true)}
                rowKey={(r) => r.id}
              />
            </section>
          ) : null}
        </>
      )}

      <PracticeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        session={editing}
        subjects={subjects.data ?? []}
        onSaved={reloadAll}
      />
      <PracticeRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        rule={editingRule}
        subjects={subjects.data ?? []}
        onSaved={reloadAll}
      />
      <PracticeCancelDialog
        session={cancelling}
        next={nextAfter(cancelling)}
        onOpenChange={(o) => {
          if (!o) setCancelling(null);
        }}
        onDone={reloadAll}
      />
      <ParticipantsDialog
        session={participantsFor}
        onOpenChange={(o) => {
          if (!o) setParticipantsFor(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Удалить сдачу?"
        description={
          deleting
            ? `${deleting.subjectShortName || deleting.subjectName}, ${fmtDateTime(deleting.startsAt)}. Записи студентов (${deleting.signupsCount}) тоже удалятся, она пропадёт из календаря.${deleting.ruleId ? " Это занятие правила: при следующей правке правила оно появится снова. Чтобы пропустить дату, отмените занятие." : ""}`
            : undefined
        }
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
      <ConfirmDialog
        open={deletingRule !== null}
        onOpenChange={(o) => {
          if (!o) setDeletingRule(null);
        }}
        title="Удалить правило?"
        description={
          deletingRule
            ? `${deletingRule.subjectShortName || deletingRule.subjectName}, ${ruleSchedule(deletingRule)}. Будущие занятия без записей удалятся; прошедшие и те, на которые уже записались, останутся разовыми.`
            : undefined
        }
        onConfirm={confirmDeleteRule}
        loading={deleteLoading}
      />
    </>
  );
}

export default function PracticePage() {
  return (
    <Suspense>
      <PracticePageInner />
    </Suspense>
  );
}
