"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { DatePicker } from "@/components/admin/date-picker";
import { FormActions } from "@/components/admin/form-actions";
import {
  FormField,
  FormGrid,
  FormSection,
} from "@/components/admin/form-field";
import { MDX_HELP, MdxEditor } from "@/components/admin/mdx-editor";
import { SelectField } from "@/components/admin/select-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { STATUS_OPTIONS } from "@/lib/admin/options";
import { adminApi } from "@/lib/api/admin";
import type { Note, NoteInput, Subject } from "@/lib/api/types";

const schema = z.object({
  subjectId: z.number().int().positive("Выберите предмет"),
  number: z.string().regex(/^\d+$/, "Введите номер лекции"),
  slug: z.string().trim(),
  title: z.string().trim().min(1, "Укажите название"),
  summary: z.string(),
  lectureDate: z.string().nullable(),
  status: z.enum(["draft", "published"]),
  content: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toForm(note: Note | null, subjects: Subject[]): FormValues {
  return {
    subjectId: note?.subjectId ?? (subjects.length === 1 ? subjects[0].id : 0),
    number: note ? String(note.number) : "1",
    slug: note?.slug ?? "",
    title: note?.title ?? "",
    summary: note?.summary ?? "",
    lectureDate: note?.lectureDate ?? null,
    status: note?.status ?? "draft",
    content: note?.content ?? "",
  };
}

export function NoteForm({
  note,
  subjects,
}: {
  note: Note | null;
  subjects: Subject[];
}) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(note, subjects),
  });
  const errors = form.formState.errors;

  async function onSubmit(values: FormValues) {
    const input: NoteInput = {
      subjectId: values.subjectId,
      number: Number(values.number),
      slug: values.slug || undefined,
      title: values.title,
      summary: values.summary,
      content: values.content,
      lectureDate: values.lectureDate,
      status: values.status,
    };
    try {
      if (note) {
        const saved = await adminApi.notes.update(note.id, input);
        form.reset(toForm(saved, subjects));
        toast.success("Конспект сохранён");
      } else {
        const created = await adminApi.notes.create(input);
        toast.success("Конспект создан");
        router.replace(`/admin/notes/${created.id}`);
      }
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormActions
        backHref="/admin/notes"
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
                htmlFor="nt-subject"
                required
                error={errors.subjectId?.message}
              >
                <SubjectCombobox
                  id="nt-subject"
                  subjects={subjects}
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? 0)}
                  invalid={!!errors.subjectId}
                />
              </FormField>
            )}
          />
          <FormField
            label="Номер лекции"
            htmlFor="nt-number"
            required
            error={errors.number?.message}
          >
            <Input
              id="nt-number"
              inputMode="numeric"
              {...form.register("number")}
              aria-invalid={!!errors.number || undefined}
            />
          </FormField>
          <FormField
            label="Название"
            htmlFor="nt-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input
              id="nt-title"
              placeholder="Указатели и ссылки"
              {...form.register("title")}
              aria-invalid={!!errors.title || undefined}
            />
          </FormField>
          <FormField
            label="Слаг"
            htmlFor="nt-slug"
            description="Пусто — сгенерируется из названия."
            error={errors.slug?.message}
          >
            <Input
              id="nt-slug"
              {...form.register("slug")}
              aria-invalid={!!errors.slug || undefined}
            />
          </FormField>
          <Controller
            control={form.control}
            name="lectureDate"
            render={({ field }) => (
              <FormField
                label="Дата лекции"
                htmlFor="nt-date"
                error={errors.lectureDate?.message}
              >
                <DatePicker
                  id="nt-date"
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormField
                label="Статус"
                htmlFor="nt-status"
                error={errors.status?.message}
              >
                <SelectField
                  id="nt-status"
                  value={field.value}
                  onChange={field.onChange}
                  options={STATUS_OPTIONS}
                />
              </FormField>
            )}
          />
          <FormField
            label="Кратко"
            htmlFor="nt-summary"
            description="О чём лекция — для списков и поиска."
            error={errors.summary?.message}
          >
            <Textarea id="nt-summary" rows={2} {...form.register("summary")} />
          </FormField>
        </FormGrid>
      </FormSection>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <FormSection
          title="Конспект"
          description="Заголовки ## и ### попадают в оглавление на сайте."
        >
          <Controller
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormField
                label="Текст"
                htmlFor="nt-content"
                error={errors.content?.message}
              >
                <MdxEditor
                  id="nt-content"
                  value={field.value}
                  onChange={field.onChange}
                  minHeight="32rem"
                />
              </FormField>
            )}
          />
        </FormSection>
        <aside className="h-fit rounded-xl border bg-card p-4 text-sm xl:sticky xl:top-20">
          <h3 className="font-heading font-semibold">Что можно использовать</h3>
          <ul className="mt-3 space-y-3">
            {MDX_HELP.map((h) => (
              <li key={h.syntax} className="space-y-0.5">
                <code className="block w-fit max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {h.syntax}
                </code>
                <p className="text-xs text-muted-foreground">{h.description}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <FormActions
        backHref="/admin/notes"
        saving={form.formState.isSubmitting}
      />
    </form>
  );
}
