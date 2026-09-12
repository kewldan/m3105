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
import { SubjectBadge } from "@/components/site/subject-badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { QuizSummary } from "@/lib/api/types";
import { fmtDateShort } from "@/lib/format";

export default function QuizzesPage() {
  const quizzes = useQuery(() => adminApi.quizzes.list());
  const [deleting, setDeleting] = useState<QuizSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.quizzes.remove(deleting.id);
      toast.success("Квиз удалён");
      setDeleting(null);
      quizzes.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<QuizSummary>[] = [
    {
      id: "title",
      header: "Название",
      sort: (r) => r.title,
      className: "max-w-[28rem] whitespace-normal",
      cell: (r) => (
        <div>
          <Link
            href={`/admin/quizzes/${r.id}`}
            className="font-medium hover:underline"
          >
            {r.title}
          </Link>
          {r.noteTitle ? (
            <div className="text-xs text-muted-foreground">
              к конспекту «{r.noteTitle}»
            </div>
          ) : null}
        </div>
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
      id: "count",
      header: "Вопросов",
      sort: (r) => r.questionsCount,
      className: "tabular-nums",
      cell: (r) => r.questionsCount,
    },
    {
      id: "status",
      header: "Статус",
      sort: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
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
          editHref={`/admin/quizzes/${r.id}`}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Квизы"
        description="Короткие тесты для самопроверки. Можно собрать вручную или вставить готовый JSON."
        actions={
          <Button render={<Link href="/admin/quizzes/new" />}>
            <PlusIcon data-icon="inline-start" />
            Новый квиз
          </Button>
        }
      />
      <DataTable
        rows={quizzes.data}
        loading={quizzes.loading}
        columns={columns}
        rowKey={(r) => r.id}
        emptyTitle="Квизов пока нет"
        emptyDescription="Создайте квиз по конспекту: вопросы с вариантами или свободным ответом."
        emptyAction={
          <Button variant="outline" render={<Link href="/admin/quizzes/new" />}>
            <PlusIcon data-icon="inline-start" />
            Добавить квиз
          </Button>
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.title ?? ""}»?`}
        description="Квиз исчезнет с сайта. Результаты у пользователей хранятся локально и не затрагиваются."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
