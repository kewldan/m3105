import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/api/types";
import { STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const published = status === "published";
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          published ? "bg-emerald-500" : "bg-amber-500",
        )}
        aria-hidden
      />
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function ParityBadge({ parity }: { parity: "odd" | "even" | "both" }) {
  const label =
    parity === "odd"
      ? "Нечётная"
      : parity === "even"
        ? "Чётная"
        : "Каждую неделю";
  return (
    <Badge
      variant="outline"
      className={cn(
        parity === "odd" &&
          "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
        parity === "even" &&
          "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      )}
    >
      {label}
    </Badge>
  );
}
