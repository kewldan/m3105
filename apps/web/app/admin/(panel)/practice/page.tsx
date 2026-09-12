"use client";

import { PlusIcon, UsersIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { ParticipantsDialog } from "@/components/admin/participants-dialog";
import { PracticeDialog } from "@/components/admin/practice-dialog";
import { RowActions } from "@/components/admin/row-actions";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { PracticeSession } from "@/lib/api/types";
import { fmtDateTime, fmtRelative, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function shiftWeek(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + WEEK_MS).toISOString();
}

function endOf(s: PracticeSession): number {
  return new Date(s.endsAt ?? s.startsAt).getTime();
}

function PracticePageInner() {
  const searchParams = useSearchParams();
  const subjects = useQuery(() => adminApi.subjects.list());
  const sessions = useQuery(() => adminApi.practice.list());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PracticeSession | null>(null);
  const [deleting, setDeleting] = useState<PracticeSession | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [participantsFor, setParticipantsFor] =
    useState<PracticeSession | null>(null);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
    }
  }, [searchParams]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const all = sessions.data ?? [];
    return {
      upcoming: all
        .filter((s) => endOf(s) >= now)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      past: all
        .filter((s) => endOf(s) < now)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    };
  }, [sessions.data]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.practice.remove(deleting.id);
      toast.success("Сдача удалена");
      setDeleting(null);
      sessions.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
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
        <div className={cn(isPast && "text-muted-foreground")}>
          <div>
            {fmtDateTime(r.startsAt)}
            {r.endsAt ? (
              <span className="text-muted-foreground">
                {" "}
                — {fmtTime(r.endsAt)}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtRelative(r.startsAt)}
          </div>
        </div>
      ),
    },
    {
      id: "subject",
      header: "Предмет",
      sort: (r) => r.subjectName,
      cell: (r) => (
        <SubjectBadge
          name={r.subjectShortName || r.subjectName}
          color={r.subjectColor}
        />
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
            onDuplicate={() => void duplicate(r)}
            onDelete={() => setDeleting(r)}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Сдачи"
        description="Занятия, на которые студенты записываются со сделанными лабами. Список записавшихся виден здесь и всем вошедшим на сайте."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Добавить сдачу
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Ближайшие</h2>
        <DataTable
          rows={sessions.loading && !sessions.data ? null : upcoming}
          loading={sessions.loading}
          columns={columns(false)}
          rowKey={(r) => r.id}
          emptyTitle="Ближайших сдач нет"
          emptyDescription="Добавьте занятие, и студенты смогут записаться на него со страницы лабы."
          emptyAction={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Добавить сдачу
            </Button>
          }
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

      <PracticeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        session={editing}
        subjects={subjects.data ?? []}
        onSaved={() => sessions.reload()}
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
            ? `${deleting.subjectShortName || deleting.subjectName}, ${fmtDateTime(deleting.startsAt)}. Записи студентов (${deleting.signupsCount}) тоже удалятся, она пропадёт из календаря.`
            : undefined
        }
        onConfirm={confirmDelete}
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
