"use client";

import { ArrowLeftIcon, SaveIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Save / back row used by full-page forms. */
export function FormActions({
  backHref,
  saving,
  saveLabel = "Сохранить",
  extra,
  className,
}: {
  backHref: string;
  saving: boolean;
  saveLabel?: string;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button type="button" variant="ghost" render={<Link href={backHref} />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Назад
      </Button>
      <div className="flex-1" />
      {extra}
      <Button type="submit" disabled={saving}>
        {saving ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SaveIcon data-icon="inline-start" />
        )}
        {saveLabel}
      </Button>
    </div>
  );
}
