"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DatePicker } from "@/components/admin/date-picker";
import { DateTimePicker } from "@/components/admin/date-time-picker";
import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField, FormGrid } from "@/components/admin/form-field";
import { SelectField } from "@/components/admin/select-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { joinDateTime, splitDateTime } from "@/lib/admin/datetime";
import { handleApiError } from "@/lib/admin/errors";
import { EVENT_KIND_OPTIONS } from "@/lib/admin/options";
import { adminApi } from "@/lib/api/admin";
import type { Event, EventInput, Subject } from "@/lib/api/types";

const schema = z.object({
  title: z.string().trim().min(1, "Укажите название события"),
  kind: z.enum(["deadline", "test", "exam", "consultation", "other"]),
  subjectId: z.number().nullable(),
  startsAt: z
    .string()
    .nullable()
    .refine((v) => (v ?? "").length > 0, "Укажите дату и время"),
  endsAt: z.string().nullable(),
  allDay: z.boolean(),
  location: z.string().trim(),
  description: z.string(),
  url: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  title: "",
  kind: "test",
  subjectId: null,
  startsAt: null,
  endsAt: null,
  allDay: false,
  location: "",
  description: "",
  url: "",
};

export function EventDialog({
  open,
  onOpenChange,
  event,
  subjects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event | null;
  subjects: Subject[];
  onSaved: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { reset } = form;
  const allDay = form.watch("allDay");

  useEffect(() => {
    if (!open) return;
    reset(
      event
        ? {
            title: event.title,
            kind: event.kind,
            subjectId: event.subjectId,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            allDay: event.allDay,
            location: event.location,
            description: event.description,
            url: event.url,
          }
        : EMPTY,
    );
  }, [open, event, reset]);

  async function onSubmit(values: FormValues) {
    const input: EventInput = {
      title: values.title,
      kind: values.kind,
      subjectId: values.subjectId,
      startsAt: values.startsAt ?? "",
      endsAt: values.endsAt,
      allDay: values.allDay,
      location: values.location,
      description: values.description,
      url: values.url,
    };
    try {
      if (event) await adminApi.events.update(event.id, input);
      else await adminApi.events.create(input);
      toast.success(event ? "Событие обновлено" : "Событие добавлено");
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
      title={event ? "Редактировать событие" : "Новое событие"}
      description="Контрольные, экзамены, консультации и прочие даты. Дедлайны лаб задаются в самих лабах."
      onSubmit={form.handleSubmit(onSubmit)}
      saving={form.formState.isSubmitting}
      size="lg"
    >
      <FormGrid>
        <FormField
          label="Название"
          htmlFor="ev-title"
          required
          error={errors.title?.message}
          className="sm:col-span-2"
        >
          <Input
            id="ev-title"
            placeholder="Контрольная по теме 3"
            {...form.register("title")}
            aria-invalid={!!errors.title || undefined}
          />
        </FormField>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormField
              label="Тип"
              htmlFor="ev-kind"
              error={errors.kind?.message}
            >
              <SelectField
                id="ev-kind"
                value={field.value}
                onChange={field.onChange}
                options={EVENT_KIND_OPTIONS}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="subjectId"
          render={({ field }) => (
            <FormField
              label="Предмет"
              htmlFor="ev-subject"
              error={errors.subjectId?.message}
            >
              <SubjectCombobox
                id="ev-subject"
                subjects={subjects}
                value={field.value}
                onChange={field.onChange}
                allowClear
                placeholder="Без предмета"
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="allDay"
          render={({ field }) => (
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                id="ev-allday"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              <Label htmlFor="ev-allday">Весь день, без точного времени</Label>
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="startsAt"
          render={({ field }) => (
            <FormField
              label="Начало"
              htmlFor="ev-start"
              required
              error={errors.startsAt?.message}
            >
              {allDay ? (
                <DatePicker
                  id="ev-start"
                  value={splitDateTime(field.value).date || null}
                  onChange={(d) =>
                    field.onChange(d ? joinDateTime(d, "00:00") : null)
                  }
                  invalid={!!errors.startsAt}
                />
              ) : (
                <DateTimePicker
                  id="ev-start"
                  value={field.value}
                  onChange={field.onChange}
                  defaultTime="09:00"
                  invalid={!!errors.startsAt}
                />
              )}
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="endsAt"
          render={({ field }) => (
            <FormField
              label="Окончание"
              htmlFor="ev-end"
              description="Необязательно."
              error={errors.endsAt?.message}
            >
              {allDay ? (
                <DatePicker
                  id="ev-end"
                  value={splitDateTime(field.value).date || null}
                  onChange={(d) =>
                    field.onChange(d ? joinDateTime(d, "23:59") : null)
                  }
                  invalid={!!errors.endsAt}
                />
              ) : (
                <DateTimePicker
                  id="ev-end"
                  value={field.value}
                  onChange={field.onChange}
                  defaultTime="10:30"
                  invalid={!!errors.endsAt}
                />
              )}
            </FormField>
          )}
        />
        <FormField
          label="Место"
          htmlFor="ev-location"
          error={errors.location?.message}
        >
          <Input
            id="ev-location"
            placeholder="Ауд. 301"
            {...form.register("location")}
          />
        </FormField>
        <FormField
          label="Ссылка"
          htmlFor="ev-url"
          description="Например, на форму записи или встречу."
          error={errors.url?.message}
        >
          <Input
            id="ev-url"
            inputMode="url"
            placeholder="https://…"
            {...form.register("url")}
            aria-invalid={!!errors.url || undefined}
          />
        </FormField>
        <FormField
          label="Описание"
          htmlFor="ev-description"
          error={errors.description?.message}
          className="sm:col-span-2"
        >
          <Textarea
            id="ev-description"
            rows={3}
            {...form.register("description")}
          />
        </FormField>
      </FormGrid>
    </EntityDialog>
  );
}
