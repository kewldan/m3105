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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Page } from "@/lib/api/types";
import { fmtDateShort } from "@/lib/format";

export default function PagesPage() {
  const pages = useQuery(() => adminApi.pages.list());
  const [deleting, setDeleting] = useState<Page | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.pages.remove(deleting.id);
      toast.success("Страница удалена");
      setDeleting(null);
      pages.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<Page>[] = [
    {
      id: "title",
      header: "Заголовок",
      sort: (r) => r.title,
      className: "max-w-[28rem] whitespace-normal",
      cell: (r) => (
        <div>
          <Link
            href={`/admin/pages/${r.id}`}
            className="font-medium hover:underline"
          >
            {r.title}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">
            /p/{r.slug}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Статус",
      sort: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      id: "nav",
      header: "В меню",
      sort: (r) => (r.showInNav ? 1 : 0),
      cell: (r) =>
        r.showInNav ? (
          <Badge variant="secondary">Да</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "position",
      header: "Порядок",
      sort: (r) => r.position,
      className: "tabular-nums",
      cell: (r) => r.position,
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
          editHref={`/admin/pages/${r.id}`}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Страницы"
        description="Статические страницы: о группе, контакты, полезные ссылки."
        actions={
          <Button render={<Link href="/admin/pages/new" />}>
            <PlusIcon data-icon="inline-start" />
            Новая страница
          </Button>
        }
      />
      <DataTable
        rows={pages.data}
        loading={pages.loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "position", dir: "asc" }}
        emptyTitle="Страниц пока нет"
        emptyDescription="Создайте страницу «О группе» или «Полезные ссылки» и включите её в меню."
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting?.title ?? ""}»?`}
        description="Страница исчезнет с сайта. Отменить нельзя."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
