"use client";

import { UserRoundSearchIcon } from "lucide-react";
import Link from "next/link";

import type { MeResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** True for a signed-in student who has not picked themselves in the course list yet. */
export function isPending(me: MeResponse | null): boolean {
  return me !== null && !me.user.approved;
}

/** One-line hint next to a locked button: the profile has the course list. */
export function PendingNotice({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <UserRoundSearchIcon className="size-3.5 shrink-0" aria-hidden />
      Сначала{" "}
      <Link href="/me" className="font-medium text-primary hover:underline">
        выберите себя в списке
      </Link>
    </span>
  );
}
