import type { KeyRoundIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Section of the profile page: title with an icon, optional action, body. */
export function ProfileCard({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: typeof KeyRoundIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
