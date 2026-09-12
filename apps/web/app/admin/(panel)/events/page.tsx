"use client";

import { PlusIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { EventDialog } from "@/components/admin/event-dialog";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Event } from "@/lib/api/types";
import {
  EVENT_KIND_LABEL,
  fmtDate,
  fmtDateTime,
  isOverdue,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function EventsPageInner() {
  const searchParams = useSearchParams();
  const subjects = useQuery(() => adminApi.subjects.list());
  const events = useQuery(() => adminApi.events.list());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState<Event | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
    }
  }, [searchParams]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.events.remove(deleting.id);
      toast.success("Событие удалено");
      setDeleting(null);
      events.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<Event>[] = [
    {
      id: "starts",
      header: "Дата",
      sort: (r) => r.startsAt,
      className: "tabular-nums",
      cell: (r) => (
        <span
          className={cn(
            isOverdue(r.endsAt ?? r.startsAt) && "text-muted-foreground",
          )}
        >
          {r.allDay ? fmtDate(r.startsAt) : fmtDateTime(r.startsAt)}
          {r.endsAt ? (
            <span className="text-muted-foreground">
              {" "}
              — {r.allDay ? fmtDate(r.endsAt) : fmtDateTime(r.endsAt)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "title",
      header: "Название",
      sort: (r) => r.title,
      className: "max-w-[24rem] whitespace-normal",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.title}</div>
          {r.location ? (
            <div className="text-xs text-muted-foreground">{r.location}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: "kind",
      header: "Тип",
      sort: (r) => r.kind,
      cell: (r) => (
        <Badge variant="secondary">{EVENT_KIND_LABEL[r.kind] ?? r.kind}</Badge>
      ),
    },
    {
      id: "subject",
      header: "Предмет",
      sort: (r) => r.subjectName,
      cell: (r) =>
        r.subjectSlug ? (
          <SubjectBadge
            name={r.subjectShortName || r.subjectName}
            color={r.subjectColor}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <RowActions
          onEdit={() => {
            setEditing(r);
            setDialogOpen(true);
          }}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Дедлайны и события"
        description="Контрольные, экзамены и другие даты календаря. Дедлайны лаб задаются на странице лабы и попадают в календарь автоматически."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Новое событие
          </Button>
        }
      />
      <DataTable
        rows={events.data}
        loading={events.loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "starts", dir: "asc" }}
        emptyTitle="Событий пока нет"
        emptyDescription="Добавьте контрольную, экзамен или консультацию — они появятся в календаре и в ICS-фиде."
      />
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editing}
        subjects={subjects.data ?? []}
        onSaved={() => events.reload()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.title ?? ""}»?`}
        description="Событие пропадёт из календаря. Отменить нельзя."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}

export default function EventsPage() {
  return (
    <Suspense>
      <EventsPageInner />
    </Suspense>
  );
}
