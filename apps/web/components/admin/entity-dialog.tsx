"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Dialog wrapper for create/edit forms: header, scrollable body, footer with actions. */
export function EntityDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  saving,
  saveLabel = "Сохранить",
  children,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  onSubmit: () => void;
  saving: boolean;
  saveLabel?: string;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-hidden p-0",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col"
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4">
            <div className="space-y-5">{children}</div>
          </div>
          <DialogFooter className="m-0 rounded-none">
            <DialogClose
              render={<Button type="button" variant="outline" />}
              disabled={saving}
            >
              Отмена
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {saveLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
