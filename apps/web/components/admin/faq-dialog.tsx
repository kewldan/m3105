"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField, FormGrid } from "@/components/admin/form-field";
import { MdxEditor } from "@/components/admin/mdx-editor";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type { FAQInput, FAQItem } from "@/lib/api/types";

const schema = z.object({
  question: z.string().trim().min(1, "Укажите вопрос"),
  answer: z.string().trim().min(1, "Укажите ответ"),
  category: z.string().trim(),
  position: z.string().regex(/^-?\d*$/, "Введите целое число"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  question: "",
  answer: "",
  category: "",
  position: "0",
};

export function FaqDialog({
  open,
  onOpenChange,
  item,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FAQItem | null;
  categories: string[];
  onSaved: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { reset } = form;
  const category = form.watch("category");

  useEffect(() => {
    if (!open) return;
    reset(
      item
        ? {
            question: item.question,
            answer: item.answer,
            category: item.category,
            position: String(item.position),
          }
        : EMPTY,
    );
  }, [open, item, reset]);

  async function onSubmit(values: FormValues) {
    const input: FAQInput = {
      question: values.question,
      answer: values.answer,
      category: values.category,
      position: Number(values.position || 0),
    };
    try {
      if (item) await adminApi.faq.update(item.id, input);
      else await adminApi.faq.create(input);
      toast.success(item ? "Вопрос обновлён" : "Вопрос добавлен");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  const errors = form.formState.errors;
  const suggestions = categories.filter((c) => c && c !== category);

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Редактировать вопрос" : "Новый вопрос"}
      onSubmit={form.handleSubmit(onSubmit)}
      saving={form.formState.isSubmitting}
      size="lg"
    >
      <FormField
        label="Вопрос"
        htmlFor="faq-question"
        required
        error={errors.question?.message}
      >
        <Input
          id="faq-question"
          placeholder="Как получить допуск к экзамену?"
          {...form.register("question")}
          aria-invalid={!!errors.question || undefined}
        />
      </FormField>
      <FormGrid>
        <FormField
          label="Категория"
          htmlFor="faq-category"
          description="Вопросы группируются по категориям."
          error={errors.category?.message}
        >
          <Input
            id="faq-category"
            placeholder="Сдача лаб"
            {...form.register("category")}
          />
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {suggestions.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  render={
                    <button
                      type="button"
                      onClick={() =>
                        form.setValue("category", c, { shouldDirty: true })
                      }
                    />
                  }
                  className="cursor-pointer hover:bg-muted"
                >
                  {c}
                </Badge>
              ))}
            </div>
          ) : null}
        </FormField>
        <FormField
          label="Порядок"
          htmlFor="faq-position"
          description="Чем меньше число, тем выше."
          error={errors.position?.message}
        >
          <Input
            id="faq-position"
            inputMode="numeric"
            {...form.register("position")}
            aria-invalid={!!errors.position || undefined}
          />
        </FormField>
      </FormGrid>
      <Controller
        control={form.control}
        name="answer"
        render={({ field }) => (
          <FormField
            label="Ответ"
            htmlFor="faq-answer"
            required
            error={errors.answer?.message}
          >
            <MdxEditor
              id="faq-answer"
              value={field.value}
              onChange={field.onChange}
              minHeight="12rem"
              invalid={!!errors.answer}
            />
          </FormField>
        )}
      />
    </EntityDialog>
  );
}
