"use client";

import { EyeIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { BroadcastDialog } from "@/components/admin/broadcast-dialog";
import { BroadcastProgress } from "@/components/admin/broadcast-progress";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { SelectField } from "@/components/admin/select-field";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Broadcast, BroadcastKind } from "@/lib/api/types";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND: Record<BroadcastKind, string> = {
  lab: "Новая лаба",
  digest: "Дайджест",
  grades: "Баллы",
  practice_canceled: "Отмена сдачи",
  practice_moved: "Перенос сдачи",
  practice_restored: "Возврат сдачи",
  swap: "Обмен местами",
  admin: "Админу",
};
const FILTERS = [
  { value: "all", label: "Все рассылки" },
  ...Object.entries(KIND).map(([value, label]) => ({ value, label })),
];

function refHref(b: Broadcast): string | null {
  if (!b.refId) return null;
  if (b.refType === "lab") return `/admin/labs/${b.refId}`;
  if (b.refType === "practice") return "/admin/practice";
  if (b.refType === "grade_source") return "/admin/grades";
  return null;
}

export default function BroadcastsPage() {
  const [kind, setKind] = useState("all");
  const { data, loading, reload } = useQuery(
    () => adminApi.broadcasts.list(kind === "all" ? undefined : kind),
    kind,
  );
  const [viewing, setViewing] = useState<Broadcast | null>(null);

  const columns: Column<Broadcast>[] = [
    {
      id: "when",
      header: "Когда",
      sort: (r) => r.createdAt,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (r) => fmtRelative(r.createdAt),
    },
    {
      id: "kind",
      header: "Тип",
      sort: (r) => r.kind,
      className: "whitespace-nowrap",
      cell: (r) => KIND[r.kind] ?? r.kind,
    },
    {
      id: "title",
      header: "Рассылка",
      sort: (r) => r.title,
      cell: (r) => {
        const href = refHref(r);
        return href ? (
          <Link href={href} className="hover:underline">
            {r.title}
          </Link>
        ) : (
          <span>{r.title}</span>
        );
      },
    },
    {
      id: "progress",
      header: "Доставка",
      sort: (r) => r.failed * 1e6 + r.total,
      cell: (r) => <BroadcastProgress b={r} />,
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Кому отправлено"
          title="Кому отправлено"
          onClick={() => setViewing(r)}
        >
          <EyeIcon />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Рассылки бота"
        description="Каждое сообщение бота: новые лабы, дайджест дедлайнов, баллы, отмены и переносы сдач, обмены местами. Видно, кому сообщение дошло, кому нет и почему; неудачные можно отправить ещё раз. Журнал хранится полгода."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={reload}
              disabled={loading}
              aria-label="Обновить"
              title="Обновить"
            >
              <RefreshCwIcon className={cn(loading && "animate-spin")} />
            </Button>
            <div className="w-48">
              <SelectField
                value={kind}
                onChange={(v) => setKind(v || "all")}
                options={FILTERS}
              />
            </div>
          </div>
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "when", dir: "desc" }}
        emptyTitle="Рассылок пока нет"
        emptyDescription="Здесь появится каждое сообщение, которое отправит бот."
      />
      <BroadcastDialog
        broadcast={viewing}
        onOpenChange={(o) => {
          if (!o) setViewing(null);
        }}
        onChanged={reload}
      />
    </>
  );
}
