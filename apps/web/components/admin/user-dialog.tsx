"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField, FormGrid } from "@/components/admin/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type { AdminUser, AdminUserInput } from "@/lib/api/types";

const schema = z.object({
  displayName: z
    .string()
    .trim()
    .max(80, "Не длиннее 80 символов")
    .refine((v) => v.length !== 1, "Слишком короткое имя"),
  groupName: z.string().trim().max(40, "Не длиннее 40 символов"),
  approved: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/** Display name, group and confirmation of a student account. */
export function UserDialog({
  open,
  onOpenChange,
  user,
  defaultGroup,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;
  /** Group from the site settings, offered when the account has none. */
  defaultGroup: string;
  onSaved: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: "", groupName: "", approved: false },
  });
  const { reset } = form;

  useEffect(() => {
    if (!open || !user) return;
    reset({
      displayName: user.displayName,
      groupName: user.groupName || defaultGroup,
      approved: user.approved,
    });
  }, [open, user, defaultGroup, reset]);

  async function onSubmit(values: FormValues) {
    if (!user) return;
    const input: AdminUserInput = {
      displayName: values.displayName,
      groupName: values.groupName,
      approved: values.approved,
    };
    try {
      await adminApi.users.update(user.id, input);
      toast.success(
        values.approved && !user.approved
          ? "Аккаунт подтверждён"
          : "Аккаунт обновлён",
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  const errors = form.formState.errors;

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Студент: ${user.name}` : "Студент"}
      onSubmit={form.handleSubmit(onSubmit)}
      saving={form.formState.isSubmitting}
    >
      <FormField
        label="Отображаемое имя"
        htmlFor="user-display-name"
        description={
          user?.telegramName
            ? `Из Telegram: ${user.telegramName}. Пусто — показывать имя из Telegram.`
            : "Пусто — показывать имя из Telegram."
        }
        error={errors.displayName?.message}
      >
        <Input
          id="user-display-name"
          placeholder="Имя Фамилия"
          autoComplete="off"
          {...form.register("displayName")}
          aria-invalid={!!errors.displayName || undefined}
        />
      </FormField>
      <FormGrid>
        <FormField
          label="Группа"
          htmlFor="user-group"
          error={errors.groupName?.message}
        >
          <Input
            id="user-group"
            placeholder={defaultGroup || "М3105"}
            autoComplete="off"
            {...form.register("groupName")}
            aria-invalid={!!errors.groupName || undefined}
          />
        </FormField>
        <Controller
          control={form.control}
          name="approved"
          render={({ field }) => (
            <FormField
              label="Доступ"
              htmlFor="user-approved"
              description="Без подтверждения студент видит сайт, но не может записываться на сдачи, отмечать лабы и писать."
            >
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id="user-approved"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="user-approved" className="font-normal">
                  {field.value ? "Подтверждён" : "Ждёт подтверждения"}
                </Label>
              </div>
            </FormField>
          )}
        />
      </FormGrid>
    </EntityDialog>
  );
}
