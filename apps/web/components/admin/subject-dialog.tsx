"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField, FormGrid } from "@/components/admin/form-field";
import { IconPicker } from "@/components/admin/icon-picker";
import { LinksEditor } from "@/components/admin/links-editor";
import { MdxEditor } from "@/components/admin/mdx-editor";
import { SelectField } from "@/components/admin/select-field";
import { Input } from "@/components/ui/input";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import {
  SUBJECT_COLORS,
  type Subject,
  type SubjectColor,
  type SubjectInput,
} from "@/lib/api/types";
import { COLOR_LABEL, subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().trim().min(1, "Укажите название предмета"),
  shortName: z.string().trim(),
  slug: z.string().trim(),
  color: z.enum(SUBJECT_COLORS),
  icon: z.string(),
  teacher: z.string().trim(),
  position: z.string().regex(/^-?\d*$/, "Введите целое число"),
  description: z.string(),
  links: z.array(z.object({ title: z.string(), url: z.string() })),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: "",
  shortName: "",
  slug: "",
  color: "blue",
  icon: "book",
  teacher: "",
  position: "0",
  description: "",
  links: [],
};

const COLOR_OPTIONS = SUBJECT_COLORS.map((c) => ({
  value: c,
  label: COLOR_LABEL[c],
}));

export function SubjectDialog({
  open,
  onOpenChange,
  subject,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: Subject | null;
  onSaved: (saved: Subject) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      subject
        ? {
            name: subject.name,
            shortName: subject.shortName,
            slug: subject.slug,
            color: subject.color,
            icon: subject.icon || "book",
            teacher: subject.teacher,
            position: String(subject.position),
            description: subject.description,
            links: subject.links ?? [],
          }
        : EMPTY,
    );
  }, [open, subject, reset]);

  async function onSubmit(values: FormValues) {
    const input: SubjectInput = {
      name: values.name,
      shortName: values.shortName,
      slug: values.slug || undefined,
      color: values.color as SubjectColor,
      icon: values.icon,
      teacher: values.teacher,
      position: Number(values.position || 0),
      description: values.description,
      links: values.links.filter((l) => l.title || l.url),
    };
    try {
      const saved = subject
        ? await adminApi.subjects.update(subject.id, input)
        : await adminApi.subjects.create(input);
      toast.success(subject ? "Предмет обновлён" : "Предмет создан");
      onSaved(saved);
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
      title={subject ? "Редактировать предмет" : "Новый предмет"}
      description="Предмет объединяет лабы, конспекты и квизы."
      onSubmit={form.handleSubmit(onSubmit)}
      saving={form.formState.isSubmitting}
      size="lg"
    >
      <FormGrid>
        <FormField
          label="Название"
          htmlFor="s-name"
          required
          error={errors.name?.message}
          className="sm:col-span-2"
        >
          <Input
            id="s-name"
            placeholder="Объектно-ориентированное программирование"
            {...form.register("name")}
            aria-invalid={!!errors.name || undefined}
          />
        </FormField>
        <FormField
          label="Короткое название"
          htmlFor="s-short"
          description="Например, ООП — для бейджей и календаря."
          error={errors.shortName?.message}
        >
          <Input
            id="s-short"
            placeholder="ООП"
            {...form.register("shortName")}
          />
        </FormField>
        <Controller
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormField
              label="Цвет"
              htmlFor="s-color"
              error={errors.color?.message}
            >
              <SelectField
                id="s-color"
                value={field.value}
                onChange={field.onChange}
                options={COLOR_OPTIONS}
                renderOption={(o) => (
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        subjectColor(o.value).dot,
                      )}
                    />
                    {o.label}
                  </span>
                )}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormField
              label="Иконка"
              htmlFor="s-icon"
              description="Показывается в карточках предмета и списках."
              className="sm:col-span-2"
            >
              <IconPicker
                id="s-icon"
                value={field.value}
                onChange={field.onChange}
                color={form.watch("color") as SubjectColor}
              />
            </FormField>
          )}
        />
        <FormField
          label="Преподаватель"
          htmlFor="s-teacher"
          error={errors.teacher?.message}
        >
          <Input
            id="s-teacher"
            placeholder="Иванов И. И."
            {...form.register("teacher")}
          />
        </FormField>
        <FormField
          label="Порядок"
          htmlFor="s-position"
          description="Чем меньше число, тем выше в списках."
          error={errors.position?.message}
        >
          <Input
            id="s-position"
            inputMode="numeric"
            {...form.register("position")}
            aria-invalid={!!errors.position || undefined}
          />
        </FormField>
        <FormField
          label="Слаг"
          htmlFor="s-slug"
          description="Часть адреса страницы. Оставьте пустым — сгенерируется из названия."
          error={errors.slug?.message}
          className="sm:col-span-2"
        >
          <Input
            id="s-slug"
            placeholder="oop"
            {...form.register("slug")}
            aria-invalid={!!errors.slug || undefined}
          />
        </FormField>
      </FormGrid>
      <Controller
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormField
            label="Описание"
            htmlFor="s-description"
            description="Показывается на странице предмета. Поддерживается MDX."
            error={errors.description?.message}
          >
            <MdxEditor
              id="s-description"
              value={field.value}
              onChange={field.onChange}
              minHeight="10rem"
            />
          </FormField>
        )}
      />
      <Controller
        control={form.control}
        name="links"
        render={({ field }) => (
          <FormField
            label="Ссылки"
            description="Курс в LMS, методички, чат по предмету."
            error={errors.links?.message}
          >
            <LinksEditor value={field.value} onChange={field.onChange} />
          </FormField>
        )}
      />
    </EntityDialog>
  );
}
