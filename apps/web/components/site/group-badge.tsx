import type { CSSProperties } from "react";

import {
  type GroupTrack,
  groupHue,
  groupNumber,
  groupTrack,
  TRACK_LABEL,
} from "@/lib/group";
import { cn } from "@/lib/utils";

/**
 * Compact study group mark next to a name: "5" for М3105, "15" for М3115.
 * Each number has its own hue at fixed OKLCH lightness, so every colour keeps
 * the same contrast. Unknown formats fall back to the full name in grey.
 * Groups 1–10 get their track to the right («ТОП ИТ ПРО», «ТОП ДС»); the
 * badge returns siblings, so the parent's flex gap spaces them.
 */
/** Each track its own hue, solid but not glaring in either theme. */
const TRACK_TONE: Record<GroupTrack, string> = {
  itpro: "bg-violet-500 text-white dark:bg-violet-400 dark:text-violet-950",
  ds: "bg-teal-600 text-white dark:bg-teal-400 dark:text-teal-950",
};

export function GroupBadge({
  group,
  className,
}: {
  group: string;
  className?: string;
}) {
  if (!group) return null;
  const n = groupNumber(group);
  const base =
    "inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] leading-none font-semibold tabular-nums";
  if (n == null) {
    return (
      <span
        className={cn(base, "bg-muted text-muted-foreground", className)}
        title={`Группа ${group}`}
      >
        {group}
      </span>
    );
  }
  const track = groupTrack(n);
  return (
    <>
      <span
        style={{ "--group-hue": groupHue(n) } as CSSProperties}
        className={cn(
          base,
          "bg-[oklch(0.94_0.05_var(--group-hue))] text-[oklch(0.45_0.13_var(--group-hue))]",
          "dark:bg-[oklch(0.32_0.07_var(--group-hue))] dark:text-[oklch(0.9_0.09_var(--group-hue))]",
          className,
        )}
        title={`Группа ${group}`}
      >
        <span aria-hidden>{n}</span>
        <span className="sr-only">группа {group}</span>
      </span>
      {track ? (
        <span
          className={cn(
            "inline-flex h-4.5 shrink-0 items-center rounded-full px-1.5 text-[9px] leading-none font-bold tracking-wide whitespace-nowrap",
            TRACK_TONE[track],
          )}
          title={`Группа ${group}: ${TRACK_LABEL[track]}`}
        >
          {TRACK_LABEL[track]}
        </span>
      ) : null}
    </>
  );
}
