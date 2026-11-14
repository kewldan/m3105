"use client";

import { RefreshCwIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BroadcastProgress } from "@/components/admin/broadcast-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type {
  Broadcast,
  BroadcastDelivery,
  DeliveryStatus,
} from "@/lib/api/types";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const DELIVERY_STATUS: Record<
  DeliveryStatus,
  { label: string; cls: string }
> = {
  sent: {
    label: "доставлено",
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  failed: { label: "ошибка", cls: "bg-destructive/10 text-destructive" },
  pending: {
    label: "не завершено",
    cls: "bg-amber-400/15 text-amber-800 dark:text-amber-300",
  },
  skipped: { label: "не отправлено", cls: "bg-muted text-muted-foreground" },
};

const FILTERS: { value: DeliveryStatus | "all"; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "failed", label: "Ошибки" },
  { value: "skipped", label: "Не отправлено" },
  { value: "pending", label: "Не завершено" },
  { value: "sent", label: "Доставлено" },
];

/** Telegram HTML → plain text for the preview. */
function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Recipients of one mailing: who got it, who did not and why. */
export function BroadcastDialog({
  broadcast,
  onOpenChange,
  onChanged,
}: {
  broadcast: Broadcast | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const id = broadcast?.id ?? 0;
  const { data, loading, reload, setData } = useQuery(
    () => (id ? adminApi.broadcasts.get(id) : Promise.resolve(null)),
    String(id),
  );
  const [filter, setFilter] = useState<DeliveryStatus | "all">("all");
  const [retrying, setRetrying] = useState(false);
  const [preview, setPreview] = useState<BroadcastDelivery | null>(null);

  const detail = data && data.id === id ? data : null;
  const head = detail ?? broadcast;
  const deliveries = detail?.deliveries ?? [];
  const shown =
    filter === "all"
      ? deliveries
      : deliveries.filter((d) => d.status === filter);
  const message = preview?.text || deliveries.find((d) => d.text)?.text || "";

  async function retry() {
    if (!id) return;
    setRetrying(true);
    try {
      const res = await adminApi.broadcasts.retry(id);
      setData(res.broadcast);
      if (res.retried === 0) toast.info("Повторять нечего");
      else if (res.failed === 0)
        toast.success(`Доставлено: ${res.sent} из ${res.retried}`);
      else
        toast.warning(
          `Доставлено ${res.sent} из ${res.retried}, снова ошибка у ${res.failed}`,
        );
      onChanged();
    } catch (err) {
      handleApiError(err);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <Dialog
      open={broadcast !== null}
      onOpenChange={(o) => {
        if (!o) {
          setFilter("all");
          setPreview(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{head?.title}</DialogTitle>
          <DialogDescription>
            {head ? `Начата ${fmtDateTime(head.createdAt)}` : null}
          </DialogDescription>
        </DialogHeader>

        {head ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <BroadcastProgress b={head} className="sm:w-80" />
            <div className="flex gap-2">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={reload}
                disabled={loading}
                aria-label="Обновить"
                title="Обновить"
              >
                <RefreshCwIcon className={cn(loading && "animate-spin")} />
              </Button>
              {head.failed > 0 || head.pending > 0 ? (
                <Button size="sm" onClick={retry} disabled={retrying}>
                  {retrying ? <Spinner /> : <SendIcon />}
                  Повторить неудачные
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const n =
              f.value === "all"
                ? deliveries.length
                : deliveries.filter((d) => d.status === f.value).length;
            if (f.value !== "all" && n === 0) return null;
            return (
              <Button
                key={f.value}
                size="xs"
                variant={filter === f.value ? "secondary" : "ghost"}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                <span className="text-muted-foreground tabular-nums">{n}</span>
              </Button>
            );
          })}
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
          {loading && !detail ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : shown.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Получателей нет.
            </p>
          ) : (
            <ul className="divide-y">
              {shown.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setPreview(d)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-muted/50 sm:flex-row sm:items-start sm:gap-3",
                      preview?.id === d.id && "bg-muted/60",
                    )}
                  >
                    <div className="min-w-0 sm:w-56 sm:shrink-0">
                      <div className="truncate font-medium">
                        {d.recipient || "Без имени"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          d.groupName,
                          d.chatId ? `чат ${d.chatId}` : "без Telegram",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <Badge
                        variant="ghost"
                        className={cn(
                          "font-normal",
                          DELIVERY_STATUS[d.status].cls,
                        )}
                      >
                        {DELIVERY_STATUS[d.status].label}
                      </Badge>
                      {d.error ? (
                        <div className="text-xs break-words text-muted-foreground">
                          {d.error}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                      {fmtRelative(d.updatedAt)}
                      {d.attempts > 1 ? <div>попыток: {d.attempts}</div> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {message ? (
          <details
            key={preview?.id ?? 0}
            className="text-sm"
            open={preview !== null}
          >
            <summary className="cursor-pointer text-muted-foreground">
              {preview
                ? `Сообщение для: ${preview.recipient || "получателя"}`
                : "Текст сообщения"}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 font-sans text-xs whitespace-pre-wrap break-words">
              {plain(message)}
            </pre>
          </details>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
