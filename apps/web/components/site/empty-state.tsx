import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Friendly placeholder for sections without content yet. */
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-fade-in flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
