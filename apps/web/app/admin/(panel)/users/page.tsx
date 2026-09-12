"use client";

import { ExternalLinkIcon, KeyRoundIcon, UsersIcon } from "lucide-react";
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
import type { AdminUser } from "@/lib/api/types";
import { fmtDateShort, fmtRelative } from "@/lib/format";

export default function UsersPage() {
  const { data, loading, reload } = useQuery(() => adminApi.users.list());
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.users.remove(deleting.id);
      toast.success("Аккаунт удалён");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      id: "name",
      header: "Студент",
      sort: (r) => r.name,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={r.name} photoUrl={r.photoUrl} size="sm" />
          <span className="truncate font-medium">{r.name}</span>
        </div>
      ),
    },
    {
      id: "telegram",
      header: "Telegram",
      sort: (r) => r.telegramUsername || (r.telegramId ? "~" : "—"),
      cell: (r) =>
        r.telegramUsername ? (
          <a
            href={`https://t.me/${r.telegramUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            @{r.telegramUsername}
            <ExternalLinkIcon className="size-3" aria-hidden />
          </a>
        ) : r.telegramId ? (
          <span className="text-muted-foreground">без username</span>
        ) : (
          <Badge variant="outline" className="gap-1 font-normal">
            <KeyRoundIcon className="size-3" aria-hidden />
            пасскей
          </Badge>
        ),
    },
    {
      id: "created",
      header: "Регистрация",
      sort: (r) => r.createdAt,
      className: "tabular-nums text-muted-foreground",
      cell: (r) => fmtDateShort(r.createdAt),
    },
    {
      id: "login",
      header: "Последний вход",
      sort: (r) => r.lastLoginAt,
      className: "text-muted-foreground",
      cell: (r) => fmtRelative(r.lastLoginAt),
    },
    {
      id: "passkeys",
      header: "Пасскеи",
      sort: (r) => r.passkeysCount,
      className: "tabular-nums",
      cell: (r) => r.passkeysCount,
    },
    {
      id: "completions",
      header: "Сдано лаб",
      sort: (r) => r.completionsCount,
      className: "tabular-nums",
      cell: (r) => r.completionsCount,
    },
    {
      id: "signups",
      header: "Записей",
      sort: (r) => r.signupsCount,
      className: "tabular-nums",
      cell: (r) => r.signupsCount,
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
        title="Студенты"
        description="Аккаунты появляются сами после первого входа через Telegram или по пасскею. Паролей нет, редактировать нечего — только удалить."
        actions={
          data ? (
            <Badge variant="secondary" className="gap-1.5">
              <UsersIcon className="size-3.5" aria-hidden />
              Всего: {data.length}
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
        emptyTitle="Пока никто не входил"
        emptyDescription="Аккаунт создаётся автоматически, когда студент впервые входит на сайт через Telegram или создаёт пасскей. Код доступа задаётся в настройках."
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить аккаунт «${deleting?.name ?? ""}»?`}
        description="Вместе с аккаунтом удалятся его пасскеи, отметки о сданных лабах и записи на сдачи. Студент сможет войти заново, но начнёт с чистого листа."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
