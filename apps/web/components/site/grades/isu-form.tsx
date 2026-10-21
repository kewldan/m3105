"use client";

import { LinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { cn } from "@/lib/utils";

/** Binds the account to score sheets by ISU number. */
export function IsuForm({
  me,
  onSaved,
  autoFocus,
  className,
}: {
  me: MeResponse;
  onSaved: (next: MeResponse) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(me.user.isu);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const next = await userApi.updateProfile({
        displayName: me.user.displayName,
        isu: value.trim(),
      });
      onSaved(next);
      if (!value.trim()) toast.success("Номер ИСУ отвязан");
      else if (next.grades.length) toast.success("Баллы найдены");
      else
        toast.info("Номер сохранён", {
          description:
            "В таблицах его пока нет — баллы появятся после следующей синхронизации, если номер верный.",
        });
    } catch (err) {
      if (err instanceof ApiError && err.fields.isu) setError(err.fields.isu);
      else
        toast.error(
          err instanceof ApiError ? err.message : "Не удалось сохранить",
        );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={cn("space-y-1.5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          placeholder="Номер ИСУ, например 558434"
          aria-label="Номер ИСУ"
          aria-invalid={error ? true : undefined}
          inputMode="numeric"
          maxLength={7}
          autoFocus={autoFocus}
          className="max-w-56"
        />
        <Button type="submit" disabled={saving || value === me.user.isu}>
          {saving ? <Spinner /> : <LinkIcon data-icon="inline-start" />}
          {me.user.isu && !value ? "Отвязать" : "Привязать"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
