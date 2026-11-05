"use client";

import { FilterIcon, FilterXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const COOKIE = "edu_scope";

/**
 * "Only my group and stream / everything" for a signed-in student. The choice
 * lives in a cookie so server pages render the right list. Nothing for guests.
 */
export function ScopeSwitch({
  group,
  all,
  className,
}: {
  group: string;
  all: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!group) return null;

  const toggle = () => {
    // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie read by the server
    document.cookie = all
      ? `${COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${COOKIE}=all; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  };

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {all ? (
          <FilterXIcon className="size-4" aria-hidden />
        ) : (
          <FilterIcon className="size-4" aria-hidden />
        )}
        {all
          ? "Показаны материалы всех потоков"
          : `Показано для ${group} и её потока`}
      </span>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0"
        onClick={toggle}
        disabled={pending}
      >
        {pending ? <Spinner /> : null}
        {all ? "Только моё" : "Показать всё"}
      </Button>
    </div>
  );
}
