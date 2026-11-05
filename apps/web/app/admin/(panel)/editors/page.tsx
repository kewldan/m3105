"use client";

import { ShieldCheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { SelectField } from "@/components/admin/select-field";
import { UserAvatar } from "@/components/admin/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { handleApiError } from "@/lib/admin/errors";
import { useStaff } from "@/lib/admin/staff";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { EditorCandidate, EditorRole, StudyGroup } from "@/lib/api/types";
import { formatAudience } from "@/lib/audience";
import { fmtDateShort } from "@/lib/format";

/** Scopes the viewer may hand out: the admin any stream or group, a stream editor groups of their streams. */
function grantable(
  groups: StudyGroup[],
  isAdmin: boolean,
  zone: string[],
  scopes: string[],
): { value: string; label: string }[] {
  if (isAdmin) {
    const streams = [
      ...new Set(groups.map((g) => g.stream).filter((n) => n > 0)),
    ]
      .sort((a, b) => a - b)
      .map((n) => ({ value: `stream:${n}`, label: `Поток ${n}` }));
    return [
      ...streams,
      ...groups.map((g) => ({ value: `group:${g.name}`, label: g.name })),
    ];
  }
  if (!scopes.some((s) => s.startsWith("stream:"))) return [];
  return zone
    .filter((t) => t.startsWith("group:"))
    .map((t) => ({ value: t, label: t.slice(6) }));
}

export default function EditorsPage() {
  const { isAdmin, zone, editor } = useStaff();
  const roles = useQuery(() => adminApi.editors.list());
  const [people, setPeople] = useState<EditorCandidate[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<EditorRole | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  useEffect(() => {
    adminApi.editors.candidates().then(setPeople).catch(handleApiError);
    adminApi.studyGroups().then(setGroups).catch(handleApiError);
  }, []);

  const scopeOptions = useMemo(
    () => grantable(groups, isAdmin, zone, editor?.scopes ?? []),
    [groups, isAdmin, zone, editor],
  );
  const canGrant = scopeOptions.length > 0;
  const mayRevoke = (r: EditorRole) =>
    isAdmin ||
    (r.scope.startsWith("group:") &&
      zone.includes(r.scope) &&
      !!editor?.scopes.some((s) => s.startsWith("stream:")));

  async function grant() {
    if (!userId || !scope) return;
    setGranting(true);
    try {
      const role = await adminApi.editors.grant({
        userId: Number(userId),
        scope,
      });
      toast.success(
        `${role.userName} — ответственный: ${formatAudience([role.scope])}`,
      );
      setUserId(null);
      roles.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setGranting(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setRevokeLoading(true);
    try {
      await adminApi.editors.revoke(revoking.id);
      toast.success("Роль снята");
      setRevoking(null);
      roles.reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setRevokeLoading(false);
    }
  }

  const columns: Column<EditorRole>[] = [
    {
      id: "name",
      header: "Студент",
      sort: (r) => r.userName,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={r.userName} photoUrl={r.photoUrl} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{r.userName}</div>
            <div className="text-xs text-muted-foreground">{r.userGroup}</div>
          </div>
        </div>
      ),
    },
    {
      id: "scope",
      header: "Отвечает за",
      sort: (r) => r.scope,
      cell: (r) => (
        <Badge variant="outline" className="gap-1 font-normal">
          <ShieldCheckIcon className="size-3" aria-hidden />
          {formatAudience([r.scope])}
        </Badge>
      ),
    },
    {
      id: "by",
      header: "Назначил",
      sort: (r) => r.grantedBy ?? "",
      className: "text-muted-foreground",
      cell: (r) => r.grantedBy ?? "админ",
    },
    {
      id: "created",
      header: "С",
      sort: (r) => r.createdAt,
      className: "tabular-nums text-muted-foreground",
      cell: (r) => fmtDateShort(r.createdAt),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) =>
        mayRevoke(r) ? (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Снять роль с ${r.userName}`}
            onClick={() => setRevoking(r)}
          >
            <XIcon />
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageTitle
        title="Ответственные"
        description={
          isAdmin
            ? "Ответственный правит лабы, конспекты, квизы, события и сдачи, адресованные только его потоку или группе. Ответственный за поток сам назначает ответственных за группы своего потока. Все правки — в «Журнале»."
            : `Вы отвечаете за: ${formatAudience(editor?.scopes ?? [])}. Правьте материалы, адресованные вашей зоне; материалы «для всех» и других потоков правит админ.`
        }
      />

      {canGrant ? (
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-sm font-medium">Студент</div>
            <SelectField
              value={userId}
              onChange={(v) => setUserId(v || null)}
              placeholder={
                people.length
                  ? "Выберите студента"
                  : "Нет подтверждённых студентов"
              }
              options={people.map((p) => ({
                value: String(p.id),
                label: `${p.name} · ${p.group}`,
              }))}
            />
          </div>
          <div className="space-y-1 sm:w-48">
            <div className="text-sm font-medium">Отвечает за</div>
            <SelectField
              value={scope}
              onChange={(v) => setScope(v || null)}
              placeholder="Поток или группа"
              options={scopeOptions}
            />
          </div>
          <Button onClick={grant} disabled={!userId || !scope || granting}>
            {granting ? <Spinner /> : <UserPlusIcon data-icon="inline-start" />}
            Назначить
          </Button>
        </section>
      ) : null}

      <DataTable
        rows={roles.data}
        loading={roles.loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "scope", dir: "asc" }}
        emptyTitle="Ответственных пока нет"
        emptyDescription={
          canGrant
            ? "Назначьте студента выше: он войдёт в админку через свой аккаунт на сайте."
            : undefined
        }
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => {
          if (!o) setRevoking(null);
        }}
        title={`Снять роль с «${revoking?.userName ?? ""}»?`}
        description="Студент потеряет доступ к админке для этой зоны. Его материалы останутся на сайте."
        confirmLabel="Снять"
        onConfirm={confirmRevoke}
        loading={revokeLoading}
      />
    </>
  );
}
