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
import type { Lab } from "@/lib/api/types";
import { fmtDateShort, fmtDateTime, isOverdue } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function LabsPage() {
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const subjects = useQuery(() => adminApi.subjects.list());
  const labs = useQuery(
    () => adminApi.labs.list({ subjectId: subjectId ?? undefined }),
    String(subjectId ?? ""),
  );
  const [deleting, setDeleting] = useState<Lab | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.labs.remove(deleting.id);
      toast.success("Лаба удалена");
      setDeleting(null);
      labs.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<Lab>[] = [
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
          href={`/admin/labs/${r.id}`}
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
      id: "deadline",
      header: "Дедлайн",
      sort: (r) => r.deadlineAt ?? "",
      cell: (r) =>
        r.deadlineAt ? (
          <span
            className={cn(
              "tabular-nums",
              isOverdue(r.deadlineAt) && "text-muted-foreground line-through",
            )}
          >
            {fmtDateTime(r.deadlineAt)}
          </span>
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
          editHref={`/admin/labs/${r.id}`}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Лабораторные"
        description="Задания, дедлайны и материалы. У каждой лабы своя страница на сайте."
        actions={
          <Button render={<Link href="/admin/labs/new" />}>
            <PlusIcon data-icon="inline-start" />
            Новая лаба
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
        {labs.data ? (
          <span className="text-sm text-muted-foreground">
            Всего: {labs.data.length}
          </span>
        ) : null}
      </div>
      <DataTable
        rows={labs.data}
        loading={labs.loading}
        columns={columns}
        rowKey={(r) => r.id}
        emptyTitle="Лаб пока нет"
        emptyDescription={
          subjectId
            ? "Для этого предмета лабы ещё не добавлены."
            : "Создайте первую лабораторную работу."
        }
        emptyAction={
          <Button variant="outline" render={<Link href="/admin/labs/new" />}>
            <PlusIcon data-icon="inline-start" />
            Добавить лабу
          </Button>
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.title ?? ""}»?`}
        description="Страница лабы и её дедлайн исчезнут с сайта. Отменить нельзя."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
