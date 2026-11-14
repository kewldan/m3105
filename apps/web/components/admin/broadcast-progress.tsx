import type { Broadcast } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "sent", cls: "bg-emerald-500" },
  { key: "failed", cls: "bg-destructive" },
  { key: "pending", cls: "bg-amber-400" },
  { key: "skipped", cls: "bg-muted-foreground/30" },
] as const;

/** Stacked bar plus «отправлено N из M» for a bot mailing. */
export function BroadcastProgress({
  b,
  className,
}: {
  b: Pick<Broadcast, "total" | "sent" | "failed" | "skipped" | "pending">;
  className?: string;
}) {
  const total = Math.max(b.total, 1);
  return (
    <div className={cn("min-w-40 space-y-1", className)}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        {SEGMENTS.map((s) =>
          b[s.key] > 0 ? (
            <div
              key={s.key}
              className={s.cls}
              style={{ width: `${(b[s.key] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
        <span>
          отправлено{" "}
          <span className="font-medium text-foreground tabular-nums">
            {b.sent}
          </span>{" "}
          из {b.total}
        </span>
        {b.failed > 0 ? (
          <span className="text-destructive tabular-nums">
            ошибок {b.failed}
          </span>
        ) : null}
        {b.pending > 0 ? (
          <span className="text-amber-700 tabular-nums dark:text-amber-300">
            в процессе {b.pending}
          </span>
        ) : null}
        {b.skipped > 0 ? (
          <span className="tabular-nums">пропущено {b.skipped}</span>
        ) : null}
      </div>
    </div>
  );
}
