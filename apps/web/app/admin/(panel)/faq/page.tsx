"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { FaqDialog } from "@/components/admin/faq-dialog";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { FAQItem } from "@/lib/api/types";
import { fmtDateShort } from "@/lib/format";

export default function FaqPage() {
  const faq = useQuery(() => adminApi.faq.list());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FAQItem | null>(null);
  const [deleting, setDeleting] = useState<FAQItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.faq.remove(deleting.id);
      toast.success("Вопрос удалён");
      setDeleting(null);
      faq.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const categories = Array.from(
    new Set((faq.data ?? []).map((f) => f.category).filter(Boolean)),
  );

  const columns: Column<FAQItem>[] = [
    {
      id: "position",
      header: "№",
      sort: (r) => r.position,
      className: "w-px tabular-nums text-muted-foreground",
      cell: (r) => r.position,
    },
    {
      id: "question",
      header: "Вопрос",
      sort: (r) => r.question,
      className: "max-w-[32rem] whitespace-normal",
      cell: (r) => <span className="font-medium">{r.question}</span>,
    },
    {
      id: "category",
      header: "Категория",
      sort: (r) => r.category,
      cell: (r) =>
        r.category ? (
          <Badge variant="secondary">{r.category}</Badge>
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
        title="ЧаВо"
        description="Частые вопросы одногруппников. Ответы поддерживают MDX."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Новый вопрос
          </Button>
        }
      />
      <DataTable
        rows={faq.data}
        loading={faq.loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "position", dir: "asc" }}
        emptyTitle="Вопросов пока нет"
        emptyDescription="Соберите то, о чём спрашивают чаще всего: допуск, пересдачи, где брать методички."
      />
      <FaqDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        categories={categories}
        onSaved={() => faq.reload()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Удалить вопрос?"
        description={deleting?.question}
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
