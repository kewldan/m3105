"use client";

import {
  CircleAlertIcon,
  ExternalLinkIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { GradeSourceDialog } from "@/components/admin/grade-source-dialog";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { SubjectIcon } from "@/components/site/subject-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { GradeSource } from "@/lib/api/types";
import { fmtRelative, plural } from "@/lib/format";

export default function GradesPage() {
  const { data, loading, reload } = useQuery(() =>
    adminApi.gradeSources.list(),
  );
  const { data: subjects } = useQuery(() => adminApi.subjects.list());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GradeSource | null>(null);
  const [deleting, setDeleting] = useState<GradeSource | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);

  async function sync(source: GradeSource) {
    setSyncing(source.id);
    try {
      const res = await adminApi.gradeSources.sync(source.id);
      toast.success(
        `${res.rows} ${plural(res.rows, "строка", "строки", "строк")} из ${res.tabs.length} ${plural(res.tabs.length, "вкладки", "вкладок", "вкладок")}`,
        {
          description: [
            res.linked ? `Привязано по имени: ${res.linked}` : "",
            res.skipped.length ? `Пропущены: ${res.skipped.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(". "),
        },
      );
    } catch (err) {
      handleApiError(err);
    } finally {
      setSyncing(null);
      reload();
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.gradeSources.remove(deleting.id);
      toast.success("Источник удалён");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<GradeSource>[] = [
    {
      id: "name",
      header: "Источник",
      sort: (r) => r.title || r.subjectName,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          <SubjectIcon icon={r.subjectIcon} color={r.subjectColor} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {r.title || r.subjectName}
            </div>
            <a
              href={`https://docs.google.com/spreadsheets/d/${r.spreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Таблица
              <ExternalLinkIcon className="size-3" aria-hidden />
            </a>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Синхронизация",
      sort: (r) => r.syncedAt ?? "",
      cell: (r) => (
        <div className="space-y-1">
          {!r.enabled ? (
            <Badge variant="outline" className="font-normal">
              выключен
            </Badge>
          ) : r.syncedAt ? (
            <span className="text-sm">
              {fmtRelative(r.syncedAt)}
              <span className="text-muted-foreground">
                {" "}
                · каждые {r.syncHours} ч
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">ещё не было</span>
          )}
          {r.syncError ? (
            <div
              className="flex max-w-xs items-start gap-1 text-xs text-destructive"
              title={r.syncError}
            >
              <CircleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span className="line-clamp-2">{r.syncError}</span>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "rows",
      header: "Студентов",
      sort: (r) => r.rowsCount,
      className: "tabular-nums",
      cell: (r) => r.rowsCount,
    },
    {
      id: "linked",
      header: "На сайте",
      sort: (r) => r.linkedCount,
      className: "tabular-nums",
      cell: (r) => r.linkedCount,
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Синхронизировать сейчас"
            title="Синхронизировать сейчас"
            disabled={syncing !== null}
            onClick={() => sync(r)}
          >
            {syncing === r.id ? <Spinner /> : <RefreshCwIcon />}
          </Button>
          <RowActions
            onEdit={() => {
              setEditing(r);
              setDialogOpen(true);
            }}
            onDelete={() => setDeleting(r)}
          />
        </div>
      ),
    },
  ];

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <>
      <PageTitle
        title="Баллы"
        description="Google-таблицы с баллами. Студенты видят свои баллы в профиле и рейтинг на /grades, бот пишет им об изменениях."
        actions={
          <Button onClick={openNew}>
            <PlusIcon data-icon="inline-start" />
            Новый источник
          </Button>
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "name", dir: "asc" }}
        emptyTitle="Таблиц с баллами пока нет"
        emptyDescription="Добавьте ссылку на Google-таблицу, открытую на просмотр, — баллы появятся на сайте после синхронизации."
        emptyAction={
          <Button variant="outline" onClick={openNew}>
            <PlusIcon data-icon="inline-start" />
            Добавить таблицу
          </Button>
        }
      />
      <GradeSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        source={editing}
        subjects={subjects ?? []}
        onSaved={(saved) => void sync(saved)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить «${deleting ? deleting.title || deleting.subjectName : ""}»?`}
        description="Баллы из этой таблицы пропадут с сайта. Сама таблица не изменится."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
