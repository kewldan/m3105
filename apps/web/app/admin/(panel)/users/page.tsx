"use client";

import {
  BadgeCheckIcon,
  ExternalLinkIcon,
  HourglassIcon,
  KeyRoundIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { UserAvatar } from "@/components/admin/user-avatar";
import { UserDialog } from "@/components/admin/user-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { AdminUser } from "@/lib/api/types";
import { fmtDateShort, fmtRelative } from "@/lib/format";

export default function UsersPage() {
  const { data, loading, reload } = useQuery(() => adminApi.users.list());
  const { data: settings } = useQuery(() => adminApi.settings.get());
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);

  const pending = data?.filter((u) => !u.approved).length ?? 0;
  const defaultGroup = settings?.groupName ?? "";

  async function approve(user: AdminUser) {
    setApproving(user.id);
    try {
      await adminApi.users.update(user.id, {
        displayName: user.displayName,
        groupName: user.groupName || defaultGroup,
        approved: true,
      });
      toast.success(`${user.name}: доступ открыт`);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setApproving(null);
    }
  }

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
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name}</div>
            {r.displayName && r.telegramName !== r.displayName ? (
              <div className="truncate text-xs text-muted-foreground">
                в Telegram: {r.telegramName}
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Доступ",
      sort: (r) => (r.approved ? 1 : 0),
      cell: (r) =>
        r.approved ? (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/40 font-normal text-emerald-700 dark:text-emerald-300"
          >
            <BadgeCheckIcon className="size-3" aria-hidden />
            {r.groupName || "подтверждён"}
          </Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 border-amber-500/40 font-normal text-amber-700 dark:text-amber-300"
            >
              <HourglassIcon className="size-3" aria-hidden />
              ждёт
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              disabled={approving === r.id}
              onClick={() => approve(r)}
            >
              Подтвердить
            </Button>
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
      cell: (r) => (
        <RowActions
          onEdit={() => setEditing(r)}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Студенты"
        description="Аккаунты появляются после первого входа через Telegram и ждут подтверждения. Имя берётся из Telegram, здесь его можно заменить на имя и фамилию."
        actions={
          data ? (
            <>
              {pending > 0 ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300"
                >
                  <HourglassIcon className="size-3.5" aria-hidden />
                  Ждут: {pending}
                </Badge>
              ) : null}
              <Badge variant="secondary" className="gap-1.5">
                <UsersIcon className="size-3.5" aria-hidden />
                Всего: {data.length}
              </Badge>
            </>
          ) : null
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "status", dir: "asc" }}
        emptyTitle="Пока никто не входил"
        emptyDescription="Аккаунт создаётся автоматически, когда студент впервые входит на сайт через Telegram. Код доступа для мгновенного подтверждения задаётся в настройках."
      />
      <UserDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        user={editing}
        defaultGroup={defaultGroup}
        onSaved={reload}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={`Удалить аккаунт «${deleting?.name ?? ""}»?`}
        description="Вместе с аккаунтом удалятся его пасскеи, отметки о сданных лабах и записи на сдачи. Студент сможет войти заново, но начнёт с чистого листа и снова будет ждать подтверждения."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
