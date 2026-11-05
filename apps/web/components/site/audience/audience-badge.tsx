import { UsersRoundIcon } from "lucide-react";

import { formatAudience } from "@/lib/audience";
import { cn } from "@/lib/utils";

/** "Потоки 1–4" next to a lab or note; nothing when it is for everyone. */
export function AudienceBadge({
  audience,
  className,
}: {
  audience: string[] | undefined;
  className?: string;
}) {
  const label = formatAudience(audience);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      title={`Для кого: ${label}`}
    >
      <UsersRoundIcon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
