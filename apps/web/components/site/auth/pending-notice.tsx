"use client";

import { HourglassIcon } from "lucide-react";
import Link from "next/link";

import type { MeResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** True for a signed-in student whose group an admin has not confirmed yet. */
export function isPending(me: MeResponse | null): boolean {
  return me !== null && !me.user.approved;
}

/**
 * Explains why student actions are locked. `compact` is a one-line hint for
 * places next to a button; the default is a card for the profile.
 */
export function PendingNotice({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <HourglassIcon className="size-3.5 shrink-0" aria-hidden />
        Аккаунт ждёт подтверждения:{" "}
        <Link href="/me" className="font-medium text-primary hover:underline">
          подробнее
        </Link>
      </span>
    );
  }
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/8 p-4 text-sm sm:p-5",
        className,
      )}
    >
      <HourglassIcon
        className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="space-y-1">
        <p className="font-semibold">Аккаунт ждёт подтверждения</p>
        <p className="text-muted-foreground">
          Администратор проверит, что вы из группы, и откроет доступ к записи на
          сдачи, отметкам о лабах, комментариям и постам. Конспекты, лабы и
          квизы доступны уже сейчас. Если ждёте долго, напишите в чат группы.
        </p>
      </div>
    </div>
  );
}
