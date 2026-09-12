"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BracesIcon, ListChecksIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ComboboxField } from "@/components/admin/combobox-field";
import { FormActions } from "@/components/admin/form-actions";
import {
  FormField,
  FormGrid,
  FormSection,
} from "@/components/admin/form-field";
import { QuizJsonTab } from "@/components/admin/quiz-json-tab";
import { QuizQuestionsEditor } from "@/components/admin/quiz-questions-editor";
import { SelectField } from "@/components/admin/select-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { STATUS_OPTIONS } from "@/lib/admin/options";
import { adminApi } from "@/lib/api/admin";
import type {
  Note,
  Quiz,
  QuizInput,
  QuizQuestion,
  Subject,
} from "@/lib/api/types";

const schema = z.object({
  title: z.string().trim().min(1, "Укажите название"),
  slug: z.string().trim(),
  description: z.string(),
  subjectId: z.number().nullable(),
  noteId: z
    .number()
    .nullable()
    // `(v ?? 0) > 0` on purpose: a narrowing predicate would change the inferred type.
    .refine((v) => (v ?? 0) > 0, "Выберите конспект, под которым будет квиз"),
  status: z.enum(["draft", "published"]),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  questions: z
    .array(z.custom<QuizQuestion>())
    .min(1, "Добавьте хотя бы один вопрос"),
});

type FormValues = z.infer<typeof schema>;

function toForm(quiz: Quiz | null): FormValues {
  return {
    title: quiz?.title ?? "",
    slug: quiz?.slug ?? "",
    description: quiz?.description ?? "",
    subjectId: quiz?.subjectId ?? null,
    noteId: quiz?.noteId ?? null,
    status: quiz?.status ?? "draft",
    shuffleQuestions: quiz?.shuffleQuestions ?? true,
    shuffleOptions: quiz?.shuffleOptions ?? true,
    questions: quiz?.questions ?? [],
  };
}

export function QuizForm({
  quiz,
  subjects,
}: {
  quiz: Quiz | null;
  subjects: Subject[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("builder");
  const [notes, setNotes] = useState<Note[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(quiz),
  });
  const errors = form.formState.errors;
  const subjectId = form.watch("subjectId");
  const questions = form.watch("questions");
  const title = form.watch("title");
  const description = form.watch("description");

  useEffect(() => {
    let cancelled = false;
    if (!subjectId) {
      setNotes([]);
      return;
    }
    adminApi.notes
      .list({ subjectId })
      .then((list) => {
        if (!cancelled) setNotes(list);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  async function onSubmit(values: FormValues) {
    const input: QuizInput = {
      subjectId: values.subjectId,
      noteId: values.subjectId ? values.noteId : null,
      slug: values.slug || undefined,
      title: values.title,
      description: values.description,
      questions: values.questions,
      shuffleQuestions: values.shuffleQuestions,
      shuffleOptions: values.shuffleOptions,
      status: values.status,
    };
    try {
      if (quiz) {
        const saved = await adminApi.quizzes.update(quiz.id, input);
        form.reset(toForm(saved));
        toast.success("Квиз сохранён");
      } else {
        const created = await adminApi.quizzes.create(input);
        toast.success("Квиз создан");
        router.replace(`/admin/quizzes/${created.id}`);
      }
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  const noteOptions = notes.map((n) => ({
    value: n.id,
    label: `${n.number}. ${n.title}`,
  }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormActions
        backHref="/admin/quizzes"
        saving={form.formState.isSubmitting}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="builder">
            <ListChecksIcon data-icon="inline-start" />
            Конструктор
          </TabsTrigger>
          <TabsTrigger value="json">
            <BracesIcon data-icon="inline-start" />
            JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-6 pt-2">
          <FormSection title="Основное">
            <FormGrid>
              <FormField
                label="Название"
                htmlFor="qz-title"
                required
                error={errors.title?.message}
                className="sm:col-span-2"
              >
                <Input
                  id="qz-title"
                  placeholder="Лекция 3. Указатели"
                  {...form.register("title")}
                  aria-invalid={!!errors.title || undefined}
                />
              </FormField>
              <FormField
                label="Слаг"
                htmlFor="qz-slug"
                description="Идентификатор квиза. Пусто — сгенерируется из названия."
                error={errors.slug?.message}
              >
                <Input
                  id="qz-slug"
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
                    htmlFor="qz-status"
                    error={errors.status?.message}
                  >
                    <SelectField
                      id="qz-status"
                      value={field.value}
                      onChange={field.onChange}
                      options={STATUS_OPTIONS}
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
                    htmlFor="qz-subject"
                    error={errors.subjectId?.message}
                  >
                    <SubjectCombobox
                      id="qz-subject"
                      subjects={subjects}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        form.setValue("noteId", null);
                      }}
                      allowClear
                      placeholder="Без предмета"
                    />
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="noteId"
                render={({ field }) => (
                  <FormField
                    label="Конспект"
                    htmlFor="qz-note"
                    description={
                      subjectId
                        ? "Квиз показывается под этим конспектом."
                        : "Сначала выберите предмет."
                    }
                    required
                    error={errors.noteId?.message}
                  >
                    <ComboboxField
                      id="qz-note"
                      options={noteOptions}
                      value={field.value}
                      onChange={field.onChange}
                      allowClear
                      disabled={!subjectId}
                      placeholder={subjectId ? "Выберите конспект" : "—"}
                      emptyText="У предмета нет конспектов"
                    />
                  </FormField>
                )}
              />
              <FormField
                label="Описание"
                htmlFor="qz-description"
                error={errors.description?.message}
                className="sm:col-span-2"
              >
                <Textarea
                  id="qz-description"
                  rows={2}
                  placeholder="Что проверяет квиз"
                  {...form.register("description")}
                />
              </FormField>
              <Controller
                control={form.control}
                name="shuffleQuestions"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Switch
                      id="qz-shuffle-q"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="qz-shuffle-q">Перемешивать вопросы</Label>
                  </div>
                )}
              />
              <Controller
                control={form.control}
                name="shuffleOptions"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Switch
                      id="qz-shuffle-o"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label htmlFor="qz-shuffle-o">
                      Перемешивать варианты ответов
                    </Label>
                  </div>
                )}
              />
            </FormGrid>
          </FormSection>

          <FormSection
            title={`Вопросы${questions.length ? ` · ${questions.length}` : ""}`}
            description="Порядок можно менять стрелками. Пояснения показываются после ответа."
          >
            <Controller
              control={form.control}
              name="questions"
              render={({ field }) => (
                <FormField
                  label="Список вопросов"
                  error={
                    errors.questions?.message ?? errors.questions?.root?.message
                  }
                >
                  <QuizQuestionsEditor
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
          </FormSection>
        </TabsContent>

        <TabsContent value="json" className="pt-2">
          <FormSection
            title="JSON квиза"
            description="Вставьте готовый JSON (например, сгенерированный по конспекту), проверьте и примените в конструктор."
          >
            <QuizJsonTab
              key={tab}
              current={{ title, description, questions }}
              onApply={(payload) => {
                if (payload.title)
                  form.setValue("title", payload.title, { shouldDirty: true });
                if (payload.description !== undefined)
                  form.setValue("description", payload.description, {
                    shouldDirty: true,
                  });
                form.setValue("questions", payload.questions, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                setTab("builder");
              }}
            />
          </FormSection>
        </TabsContent>
      </Tabs>

      <FormActions
        backHref="/admin/quizzes"
        saving={form.formState.isSubmitting}
      />
    </form>
  );
}
