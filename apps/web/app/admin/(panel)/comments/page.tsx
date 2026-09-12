"use client";

import { ExternalLinkIcon, MessageCircleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { UserAvatar } from "@/components/admin/user-avatar";
import { Badge } from "@/components/ui/badge";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { AdminComment, CommentTarget } from "@/lib/api/types";
import { fmtRelative } from "@/lib/format";

const TARGET_LABEL: Record<CommentTarget, string> = {
  note: "Конспект",
  lab: "Лаба",
  post: "Пост",
};

export default function CommentsPage() {
  const { data, loading, reload } = useQuery(() => adminApi.comments.list());
  const [deleting, setDeleting] = useState<AdminComment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.comments.remove(deleting.id);
      toast.success("Комментарий удалён");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<AdminComment>[] = [
    {
      id: "author",
      header: "Автор",
      sort: (r) => r.authorName,
      className: "w-48",
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar
            name={r.authorName}
            photoUrl={r.authorPhotoUrl}
            size="sm"
          />
          <span className="truncate font-medium">{r.authorName}</span>
        </div>
      ),
    },
    {
      id: "body",
      header: "Текст",
      cell: (r) => (
        <p className="line-clamp-3 max-w-xl break-words whitespace-pre-wrap">
          {r.body}
        </p>
      ),
    },
    {
      id: "target",
      header: "Где",
      sort: (r) => `${r.targetType}:${r.targetTitle ?? ""}`,
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <Badge variant="secondary" className="w-fit">
            {TARGET_LABEL[r.targetType]}
          </Badge>
          {r.targetPath ? (
            <a
              href={r.targetPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-56 items-center gap-1 text-primary hover:underline"
            >
              <span className="truncate">{r.targetTitle ?? r.targetPath}</span>
              <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
            </a>
          ) : (
            <span className="text-muted-foreground">удалено</span>
          )}
        </div>
      ),
    },
    {
      id: "created",
      header: "Когда",
      sort: (r) => r.createdAt,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (r) => fmtRelative(r.createdAt),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => <RowActions onDelete={() => setDeleting(r)} />,
    },
  ];

  return (
    <>
      <PageTitle
        title="Комментарии"
        description="Последние 200 комментариев студентов к конспектам, лабам и постам. Редактировать чужие слова нельзя, удалить — можно."
        actions={
          data ? (
            <Badge variant="secondary" className="gap-1.5">
              <MessageCircleIcon className="size-3.5" aria-hidden />
              Показано: {data.length}
            </Badge>
          ) : null
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "created", dir: "desc" }}
        emptyTitle="Комментариев пока нет"
        emptyDescription="Студенты могут комментировать опубликованные конспекты и лабы, а также посты в лентах «Шаверма» и «Анекдоты»."
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Удалить комментарий?"
        description={
          deleting
            ? `«${deleting.body.slice(0, 120)}» — ${deleting.authorName}`
            : ""
        }
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
