"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Note } from "@/lib/api/types";
import { fmtDateOnly, fmtDateShort } from "@/lib/format";

export default function NotesPage() {
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const subjects = useQuery(() => adminApi.subjects.list());
  const notes = useQuery(
    () => adminApi.notes.list({ subjectId: subjectId ?? undefined }),
    String(subjectId ?? ""),
  );
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.notes.remove(deleting.id);
      toast.success("Конспект удалён");
      setDeleting(null);
      notes.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<Note>[] = [
    {
      id: "number",
      header: "№",
      sort: (r) => r.number,
      className: "w-px tabular-nums",
      cell: (r) => r.number,
    },
    {
      id: "title",
      header: "Название",
      sort: (r) => r.title,
      className: "max-w-[28rem] whitespace-normal",
      cell: (r) => (
        <Link
          href={`/admin/notes/${r.id}`}
          className="font-medium hover:underline"
        >
          {r.title}
        </Link>
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
      id: "status",
      header: "Статус",
      sort: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      id: "date",
      header: "Дата лекции",
      sort: (r) => r.lectureDate ?? "",
      className: "tabular-nums",
      cell: (r) =>
        r.lectureDate ? (
          fmtDateOnly(r.lectureDate)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "updated",
      header: "Обновлено",
      sort: (r) => r.updatedAt,
      className: "text-muted-foreground tabular-nums",
      cell: (r) => fmtDateShort(r.updatedAt),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <RowActions
          editHref={`/admin/notes/${r.id}`}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Конспекты"
        description="Конспекты лекций в MDX: формулы, код, врезки. К конспекту можно привязать квиз."
        actions={
          <Button render={<Link href="/admin/notes/new" />}>
            <PlusIcon data-icon="inline-start" />
            Новый конспект
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-72">
          <SubjectCombobox
            subjects={subjects.data ?? []}
            value={subjectId}
            onChange={setSubjectId}
            allowClear
            placeholder="Все предметы"
          />
        </div>
        {notes.data ? (
          <span className="text-sm text-muted-foreground">
            Всего: {notes.data.length}
          </span>
        ) : null}
      </div>
      <DataTable
        rows={notes.data}
        loading={notes.loading}
        columns={columns}
        rowKey={(r) => r.id}
        emptyTitle="Конспектов пока нет"
        emptyDescription="Добавьте первый конспект — он появится на сайте после публикации."
        emptyAction={
          <Button variant="outline" render={<Link href="/admin/notes/new" />}>
            <PlusIcon data-icon="inline-start" />
            Добавить конспект
          </Button>
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.title ?? ""}»?`}
        description="Квизы, привязанные к конспекту, останутся, но потеряют связь. Отменить нельзя."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
