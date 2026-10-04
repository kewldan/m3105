"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";

/** Lets the student replace the Telegram name with their first and last name. */
export function NameDialog({
  open,
  onOpenChange,
  current,
  telegramName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  telegramName: string;
  onSaved: (next: MeResponse) => void;
}) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (displayName: string) => {
    setSaving(true);
    setError("");
    try {
      onSaved(await userApi.updateProfile({ displayName }));
      onOpenChange(false);
      toast.success(displayName ? "Имя сохранено" : "Вернули имя из Telegram");
    } catch (err) {
      if (err instanceof ApiError && err.fields.displayName) {
        setError(err.fields.displayName);
      } else {
        toast.error(
          err instanceof ApiError ? err.message : "Не удалось сохранить",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(current);
          setError("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Имя и фамилия</DialogTitle>
          <DialogDescription>
            Так вас увидят в очереди на сдачу и в комментариях. Преподаватель
            ищет по фамилии, поэтому лучше настоящие.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(value.trim());
          }}
        >
          <div className="space-y-1.5">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Иван Петров"
              aria-label="Имя и фамилия"
              aria-invalid={error ? true : undefined}
              autoComplete="name"
              maxLength={80}
              autoFocus
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="sm:justify-between">
            {current ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void save("")}
                title={`Показывать «${telegramName}»`}
              >
                Взять из Telegram
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner /> : null}
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
