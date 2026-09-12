"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { SubjectDialog } from "@/components/admin/subject-dialog";
import { SubjectIcon } from "@/components/site/subject-icon";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Subject, SubjectWithCounts } from "@/lib/api/types";

export default function SubjectsPage() {
  const { data, loading, reload } = useQuery(() => adminApi.subjects.list());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<SubjectWithCounts | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.subjects.remove(deleting.id);
      toast.success("Предмет удалён");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<SubjectWithCounts>[] = [
    {
      id: "name",
      header: "Предмет",
      sort: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <SubjectIcon icon={r.icon} color={r.color} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name}</div>
            {r.shortName ? (
              <div className="text-xs text-muted-foreground">{r.shortName}</div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: "teacher",
      header: "Преподаватель",
      sort: (r) => r.teacher,
      cell: (r) =>
        r.teacher || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "labs",
      header: "Лабы",
      sort: (r) => r.labsCount,
      className: "tabular-nums",
      cell: (r) => r.labsCount,
    },
    {
      id: "notes",
      header: "Конспекты",
      sort: (r) => r.notesCount,
      className: "tabular-nums",
      cell: (r) => r.notesCount,
    },
    {
      id: "quizzes",
      header: "Квизы",
      sort: (r) => r.quizzesCount,
      className: "tabular-nums",
      cell: (r) => r.quizzesCount,
    },
    {
      id: "position",
      header: "Порядок",
      sort: (r) => r.position,
      className: "tabular-nums",
      cell: (r) => r.position,
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
        title="Предметы"
        description="Дисциплины семестра. Цвет используется в календаре и бейджах."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Новый предмет
          </Button>
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "position", dir: "asc" }}
        emptyTitle="Предметов пока нет"
        emptyDescription="Начните с добавления предметов — к ним привязываются лабы, конспекты и квизы."
        emptyAction={
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Добавить предмет
          </Button>
        }
      />
      <SubjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subject={editing}
        onSaved={() => reload()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.name ?? ""}»?`}
        description={
          deleting
            ? `Вместе с предметом удалятся ${deleting.labsCount} лаб и ${deleting.notesCount} конспектов. Квизы и события останутся, но потеряют привязку. Отменить нельзя.`
            : undefined
        }
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
