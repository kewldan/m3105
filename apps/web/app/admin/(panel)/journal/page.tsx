"use client";

import { EyeIcon, HistoryIcon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { SelectField } from "@/components/admin/select-field";
import { AudienceBadge } from "@/components/site/audience/audience-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { handleApiError } from "@/lib/admin/errors";
import { useStaff } from "@/lib/admin/staff";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Edit } from "@/lib/api/types";
import { fmtRelative } from "@/lib/format";

const ENTITY: Record<Edit["entity"], string> = {
  labs: "Лаба",
  notes: "Конспект",
  quizzes: "Квиз",
  events: "Событие",
  practice: "Сдача",
};
const ACTION: Record<Edit["action"], { label: string; cls: string }> = {
  create: { label: "создание", cls: "text-emerald-700 dark:text-emerald-300" },
  update: { label: "правка", cls: "text-sky-700 dark:text-sky-300" },
  delete: { label: "удаление", cls: "text-destructive" },
};
const FILTERS = [
  { value: "all", label: "Всё" },
  ...Object.entries(ENTITY).map(([value, label]) => ({ value, label })),
];
/** Fields that change on every save and say nothing about the content. */
const NOISE = new Set([
  "updatedAt",
  "createdAt",
  "signupsCount",
  "quizzesCount",
]);

function show(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v, null, 1);
}

/** Fields that differ between two snapshots; one side may be missing. */
function changes(e: Edit): { key: string; before: unknown; after: unknown }[] {
  const a = e.before ?? {};
  const b = e.after ?? {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys
    .filter(
      (k) => !NOISE.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
    )
    .map((k) => ({ key: k, before: a[k], after: b[k] }));
}

function entityHref(e: Edit): string | null {
  if (e.action === "delete") return null;
  if (e.entity === "labs" || e.entity === "notes" || e.entity === "quizzes")
    return `/admin/${e.entity}/${e.entityId}`;
  return `/admin/${e.entity}`;
}

export default function JournalPage() {
  const { isAdmin } = useStaff();
  const [entity, setEntity] = useState("all");
  const { data, loading, reload } = useQuery(
    () => adminApi.journal.list(entity === "all" ? undefined : entity),
    entity,
  );
  const [viewing, setViewing] = useState<Edit | null>(null);
  const [reverting, setReverting] = useState<Edit | null>(null);
  const [revertLoading, setRevertLoading] = useState(false);

  async function confirmRevert() {
    if (!reverting) return;
    setRevertLoading(true);
    try {
      await adminApi.journal.revert(reverting.id);
      toast.success("Правка откачена");
      setReverting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setRevertLoading(false);
    }
  }

  const columns: Column<Edit>[] = [
    {
      id: "when",
      header: "Когда",
      sort: (r) => r.createdAt,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (r) => fmtRelative(r.createdAt),
    },
    {
      id: "who",
      header: "Кто",
      sort: (r) => r.actorName,
      cell: (r) => (
        <span className={r.actorId ? "font-medium" : "text-muted-foreground"}>
          {r.actorName}
        </span>
      ),
    },
    {
      id: "what",
      header: "Что",
      sort: (r) => `${r.entity}${r.action}`,
      cell: (r) => (
        <span className="whitespace-nowrap">
          {ENTITY[r.entity]},{" "}
          <span className={ACTION[r.action].cls}>{ACTION[r.action].label}</span>
        </span>
      ),
    },
    {
      id: "title",
      header: "Материал",
      sort: (r) => r.title,
      cell: (r) => {
        const href = entityHref(r);
        return (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {href ? (
              <Link href={href} className="truncate hover:underline">
                {r.title}
              </Link>
            ) : (
              <span className="truncate">{r.title}</span>
            )}
            <AudienceBadge audience={r.audience} className="text-[10px]" />
            {r.revertedAt ? (
              <Badge variant="outline" className="font-normal">
                откачено
              </Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Что изменилось"
            title="Что изменилось"
            onClick={() => setViewing(r)}
          >
            <EyeIcon />
          </Button>
          {isAdmin && !r.revertedAt ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Откатить"
              title="Откатить"
              onClick={() => setReverting(r)}
            >
              <Undo2Icon />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const diff = viewing ? changes(viewing) : [];
  return (
    <>
      <PageTitle
        title="Журнал правок"
        description={
          isAdmin
            ? "Каждое создание, правка и удаление лаб, конспектов, квизов, событий и сдач. Правки ответственных бот присылает вам сразу; любую можно откатить."
            : "Правки материалов вашей зоны: ваши и других ответственных. Откатить правку может админ."
        }
        actions={
          <div className="w-44">
            <SelectField
              value={entity}
              onChange={(v) => setEntity(v || "all")}
              options={FILTERS}
            />
          </div>
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "when", dir: "desc" }}
        emptyTitle="Правок пока нет"
        emptyDescription="Здесь появится каждое изменение материалов."
      />

      <Dialog
        open={viewing !== null}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4" aria-hidden />
              {viewing?.title}
            </DialogTitle>
            <DialogDescription>
              {viewing
                ? `${viewing.actorName}, ${ACTION[viewing.action].label}, ${fmtRelative(viewing.createdAt)}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {diff.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Содержимое не изменилось.
            </p>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              {diff.map((d) => (
                <div key={d.key} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {d.key}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <pre className="max-h-48 overflow-auto rounded-lg bg-destructive/8 p-2 text-xs whitespace-pre-wrap break-words">
                      {show(d.before)}
                    </pre>
                    <pre className="max-h-48 overflow-auto rounded-lg bg-emerald-500/8 p-2 text-xs whitespace-pre-wrap break-words">
                      {show(d.after)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={reverting !== null}
        onOpenChange={(o) => {
          if (!o) setReverting(null);
        }}
        title={`Откатить: ${reverting?.title ?? ""}?`}
        description={
          reverting?.action === "create"
            ? "Созданный материал будет удалён."
            : reverting?.action === "update"
              ? "Материал вернётся к версии до этой правки. Более поздние правки тоже пропадут."
              : "Удалённый материал создастся заново (с новым адресом в админке, комментарии не вернутся)."
        }
        confirmLabel="Откатить"
        onConfirm={confirmRevert}
        loading={revertLoading}
      />
    </>
  );
}
