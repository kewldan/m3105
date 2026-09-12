"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DateTimePicker } from "@/components/admin/date-time-picker";
import { FormActions } from "@/components/admin/form-actions";
import {
  FormField,
  FormGrid,
  FormSection,
} from "@/components/admin/form-field";
import { LinksEditor } from "@/components/admin/links-editor";
import { MdxEditor } from "@/components/admin/mdx-editor";
import { SelectField } from "@/components/admin/select-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { STATUS_OPTIONS } from "@/lib/admin/options";
import { adminApi } from "@/lib/api/admin";
import type { Lab, LabInput, Subject } from "@/lib/api/types";

const schema = z.object({
  subjectId: z.number().int().positive("Выберите предмет"),
  number: z.string().regex(/^\d+$/, "Введите номер лабы"),
  slug: z.string().trim(),
  title: z.string().trim().min(1, "Укажите название"),
  summary: z.string(),
  status: z.enum(["draft", "published"]),
  teacher: z.string().trim(),
  deadlineAt: z.string().nullable(),
  deadlineNote: z.string(),
  maxScore: z.string().regex(/^\d*$/, "Введите целое число"),
  materials: z.array(z.object({ title: z.string(), url: z.string() })),
  content: z.string(),
  requirements: z.string(),
  submission: z.string(),
  variants: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toForm(lab: Lab | null, subjects: Subject[]): FormValues {
  return {
    subjectId: lab?.subjectId ?? (subjects.length === 1 ? subjects[0].id : 0),
    number: lab ? String(lab.number) : "1",
    slug: lab?.slug ?? "",
    title: lab?.title ?? "",
    summary: lab?.summary ?? "",
    status: lab?.status ?? "draft",
    teacher: lab?.teacher ?? "",
    deadlineAt: lab?.deadlineAt ?? null,
    deadlineNote: lab?.deadlineNote ?? "",
    maxScore: lab?.maxScore != null ? String(lab.maxScore) : "",
    materials: lab?.materials ?? [],
    content: lab?.content ?? "",
    requirements: lab?.requirements ?? "",
    submission: lab?.submission ?? "",
    variants: lab?.variants ?? "",
  };
}

const CONTENT_TABS: {
  value: keyof Pick<
    FormValues,
    "content" | "requirements" | "submission" | "variants"
  >;
  label: string;
  hint: string;
}[] = [
  { value: "content", label: "Описание", hint: "Задание, теория, примеры." },
  {
    value: "requirements",
    label: "Требования",
    hint: "Что должно быть в работе, критерии оценки.",
  },
  {
    value: "submission",
    label: "Как сдавать",
    hint: "Формат отчёта, куда загружать, как проходит защита.",
  },
  {
    value: "variants",
    label: "Варианты",
    hint: "Таблица вариантов или правило их распределения.",
  },
];

export function LabForm({
  lab,
  subjects,
}: {
  lab: Lab | null;
  subjects: Subject[];
}) {
  const router = useRouter();
  const [contentTab, setContentTab] = useState<string>("content");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(lab, subjects),
  });
  const errors = form.formState.errors;

  async function onSubmit(values: FormValues) {
    const input: LabInput = {
      subjectId: values.subjectId,
      number: Number(values.number),
      slug: values.slug || undefined,
      title: values.title,
      summary: values.summary,
      content: values.content,
      requirements: values.requirements,
      submission: values.submission,
      variants: values.variants,
      materials: values.materials.filter((l) => l.title || l.url),
      deadlineAt: values.deadlineAt,
      deadlineNote: values.deadlineNote,
      maxScore: values.maxScore === "" ? null : Number(values.maxScore),
      teacher: values.teacher,
      status: values.status,
    };
    try {
      if (lab) {
        const saved = await adminApi.labs.update(lab.id, input);
        form.reset(toForm(saved, subjects));
        toast.success("Лаба сохранена");
      } else {
        const created = await adminApi.labs.create(input);
        toast.success("Лаба создана");
        router.replace(`/admin/labs/${created.id}`);
      }
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormActions
        backHref="/admin/labs"
        saving={form.formState.isSubmitting}
      />

      <FormSection title="Основное">
        <FormGrid>
          <Controller
            control={form.control}
            name="subjectId"
            render={({ field }) => (
              <FormField
                label="Предмет"
                htmlFor="lab-subject"
                required
                error={errors.subjectId?.message}
              >
                <SubjectCombobox
                  id="lab-subject"
                  subjects={subjects}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? 0)}
                  invalid={!!errors.subjectId}
                />
              </FormField>
            )}
          />
          <FormField
            label="Номер"
            htmlFor="lab-number"
            required
            error={errors.number?.message}
          >
            <Input
              id="lab-number"
              inputMode="numeric"
              {...form.register("number")}
              aria-invalid={!!errors.number || undefined}
            />
          </FormField>
          <FormField
            label="Название"
            htmlFor="lab-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input
              id="lab-title"
              placeholder="Работа с указателями"
              {...form.register("title")}
              aria-invalid={!!errors.title || undefined}
            />
          </FormField>
          <FormField
            label="Слаг"
            htmlFor="lab-slug"
            description="Адрес страницы внутри предмета. Пусто — сгенерируется из названия."
            error={errors.slug?.message}
          >
            <Input
              id="lab-slug"
              placeholder="rabota-s-ukazatelyami"
              {...form.register("slug")}
              aria-invalid={!!errors.slug || undefined}
            />
          </FormField>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormField
                label="Статус"
                htmlFor="lab-status"
                description="Черновики видны только в админке."
                error={errors.status?.message}
              >
                <SelectField
                  id="lab-status"
                  value={field.value}
                  onChange={field.onChange}
                  options={STATUS_OPTIONS}
                />
              </FormField>
            )}
          />
          <FormField
            label="Кратко"
            htmlFor="lab-summary"
            description="Одно-два предложения для списков и календаря."
            error={errors.summary?.message}
            className="sm:col-span-2"
          >
            <Textarea id="lab-summary" rows={2} {...form.register("summary")} />
          </FormField>
          <FormField
            label="Преподаватель"
            htmlFor="lab-teacher"
            description="Если отличается от преподавателя предмета."
            error={errors.teacher?.message}
          >
            <Input id="lab-teacher" {...form.register("teacher")} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Дедлайн"
        description="Дедлайны мягкие: после срока лаба остаётся доступной, но помечается просроченной."
      >
        <FormGrid>
          <Controller
            control={form.control}
            name="deadlineAt"
            render={({ field }) => (
              <FormField
                label="Срок сдачи"
                htmlFor="lab-deadline"
                error={errors.deadlineAt?.message}
              >
                <DateTimePicker
                  id="lab-deadline"
                  value={field.value}
                  onChange={field.onChange}
                  defaultTime="23:59"
                  invalid={!!errors.deadlineAt}
                />
              </FormField>
            )}
          />
          <FormField
            label="Максимум баллов"
            htmlFor="lab-score"
            error={errors.maxScore?.message}
          >
            <Input
              id="lab-score"
              inputMode="numeric"
              placeholder="10"
              {...form.register("maxScore")}
              aria-invalid={!!errors.maxScore || undefined}
            />
          </FormField>
          <FormField
            label="Примечание к дедлайну"
            htmlFor="lab-deadline-note"
            description="Например: «минус балл за каждую неделю опоздания»."
            error={errors.deadlineNote?.message}
            className="sm:col-span-2"
          >
            <Input id="lab-deadline-note" {...form.register("deadlineNote")} />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Материалы"
        description="Методички, шаблоны отчётов, репозитории."
      >
        <Controller
          control={form.control}
          name="materials"
          render={({ field }) => (
            <FormField label="Ссылки" error={errors.materials?.message}>
              <LinksEditor
                value={field.value}
                onChange={field.onChange}
                addLabel="Добавить материал"
              />
            </FormField>
          )}
        />
      </FormSection>

      <FormSection
        title="Содержимое"
        description="Каждая вкладка — отдельный раздел страницы лабы. Пустые разделы не показываются."
      >
        <Tabs
          value={contentTab}
          onValueChange={(v) => setContentTab(String(v))}
        >
          <TabsList
            variant="line"
            className="w-full justify-start overflow-x-auto"
          >
            {CONTENT_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-none">
                {t.label}
                {form.watch(t.value)?.trim() ? (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    aria-hidden
                  />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {CONTENT_TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="pt-3">
              <Controller
                control={form.control}
                name={t.value}
                render={({ field }) => (
                  <FormField
                    label={t.label}
                    htmlFor={`lab-${t.value}`}
                    description={t.hint}
                    error={errors[t.value]?.message}
                  >
                    <MdxEditor
                      id={`lab-${t.value}`}
                      value={field.value}
                      onChange={field.onChange}
                      minHeight="18rem"
                    />
                  </FormField>
                )}
              />
            </TabsContent>
          ))}
        </Tabs>
      </FormSection>

      <FormActions
        backHref="/admin/labs"
        saving={form.formState.isSubmitting}
      />
    </form>
  );
}
