"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DateTimePicker } from "@/components/admin/date-time-picker";
import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField, FormGrid } from "@/components/admin/form-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type {
  PracticeSession,
  PracticeSessionInput,
  Subject,
} from "@/lib/api/types";

const schema = z.object({
  subjectId: z
    .number()
    .nullable()
    .refine((v) => v !== null && v > 0, "Выберите предмет"),
  startsAt: z
    .string()
    .nullable()
    .refine((v) => (v ?? "").length > 0, "Укажите дату и время"),
  endsAt: z.string().nullable(),
  location: z.string().trim(),
  capacity: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), "Целое число или пусто"),
  note: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  subjectId: null,
  startsAt: null,
  endsAt: null,
  location: "",
  capacity: "",
  note: "",
};

export function PracticeDialog({
  open,
  onOpenChange,
  session,
  subjects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PracticeSession | null;
  subjects: Subject[];
  onSaved: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      session
        ? {
            subjectId: session.subjectId,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            location: session.location,
            capacity: session.capacity != null ? String(session.capacity) : "",
            note: session.note,
          }
        : EMPTY,
    );
  }, [open, session, reset]);

  async function onSubmit(values: FormValues) {
    const input: PracticeSessionInput = {
      subjectId: values.subjectId ?? 0,
      startsAt: values.startsAt ?? "",
      endsAt: values.endsAt,
      location: values.location,
      capacity: values.capacity === "" ? null : Number(values.capacity),
      note: values.note,
    };
    try {
      if (session) await adminApi.practice.update(session.id, input);
      else await adminApi.practice.create(input);
      toast.success(session ? "Сдача обновлена" : "Сдача добавлена");
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
      title={session ? "Редактировать сдачу" : "Новая сдача"}
      description="Занятие, на которое студенты записываются со сделанными лабами. Попадает в календарь и ICS."
      onSubmit={form.handleSubmit(onSubmit)}
      saving={form.formState.isSubmitting}
      size="lg"
    >
      <FormGrid>
        <Controller
          control={form.control}
          name="subjectId"
          render={({ field }) => (
            <FormField
              label="Предмет"
              htmlFor="pr-subject"
              required
              error={errors.subjectId?.message}
              className="sm:col-span-2"
            >
              <SubjectCombobox
                id="pr-subject"
                subjects={subjects}
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.subjectId}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="startsAt"
          render={({ field }) => (
            <FormField
              label="Начало"
              htmlFor="pr-start"
              required
              error={errors.startsAt?.message}
            >
              <DateTimePicker
                id="pr-start"
                value={field.value}
                onChange={field.onChange}
                defaultTime="13:00"
                invalid={!!errors.startsAt}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="endsAt"
          render={({ field }) => (
            <FormField
              label="Окончание"
              htmlFor="pr-end"
              description="Необязательно, для календаря."
              error={errors.endsAt?.message}
            >
              <DateTimePicker
                id="pr-end"
                value={field.value}
                onChange={field.onChange}
                defaultTime="14:30"
                invalid={!!errors.endsAt}
              />
            </FormField>
          )}
        />
        <FormField
          label="Аудитория"
          htmlFor="pr-location"
          error={errors.location?.message}
        >
          <Input
            id="pr-location"
            placeholder="412"
            {...form.register("location")}
          />
        </FormField>
        <FormField
          label="Мест"
          htmlFor="pr-capacity"
          description="Сколько студентов можно записать. Пусто — без лимита."
          error={errors.capacity?.message}
        >
          <Input
            id="pr-capacity"
            inputMode="numeric"
            placeholder="без лимита"
            {...form.register("capacity")}
            aria-invalid={!!errors.capacity || undefined}
          />
        </FormField>
        <FormField
          label="Заметка"
          htmlFor="pr-note"
          description="Видна студентам при записи."
          error={errors.note?.message}
          className="sm:col-span-2"
        >
          <Textarea
            id="pr-note"
            rows={3}
            placeholder="Приносите ноутбук с собранным проектом."
            {...form.register("note")}
          />
        </FormField>
      </FormGrid>
    </EntityDialog>
  );
}
