"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormActions } from "@/components/admin/form-actions";
import {
  FormField,
  FormGrid,
  FormSection,
} from "@/components/admin/form-field";
import { MdxEditor } from "@/components/admin/mdx-editor";
import { SelectField } from "@/components/admin/select-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { STATUS_OPTIONS } from "@/lib/admin/options";
import { adminApi } from "@/lib/api/admin";
import type { Page, PageInput } from "@/lib/api/types";

const schema = z.object({
  title: z.string().trim().min(1, "Укажите заголовок"),
  slug: z.string().trim(),
  summary: z.string(),
  content: z.string(),
  position: z.string().regex(/^-?\d*$/, "Введите целое число"),
  showInNav: z.boolean(),
  status: z.enum(["draft", "published"]),
});

type FormValues = z.infer<typeof schema>;

function toForm(page: Page | null): FormValues {
  return {
    title: page?.title ?? "",
    slug: page?.slug ?? "",
    summary: page?.summary ?? "",
    content: page?.content ?? "",
    position: String(page?.position ?? 0),
    showInNav: page?.showInNav ?? false,
    status: page?.status ?? "draft",
  };
}

export function PageForm({ page }: { page: Page | null }) {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(page),
  });
  const errors = form.formState.errors;

  async function onSubmit(values: FormValues) {
    const input: PageInput = {
      title: values.title,
      slug: values.slug || undefined,
      summary: values.summary,
      content: values.content,
      position: Number(values.position || 0),
      showInNav: values.showInNav,
      status: values.status,
    };
    try {
      if (page) {
        const saved = await adminApi.pages.update(page.id, input);
        form.reset(toForm(saved));
        toast.success("Страница сохранена");
      } else {
        const created = await adminApi.pages.create(input);
        toast.success("Страница создана");
        router.replace(`/admin/pages/${created.id}`);
      }
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormActions
        backHref="/admin/pages"
        saving={form.formState.isSubmitting}
      />
      <FormSection title="Основное">
        <FormGrid>
          <FormField
            label="Заголовок"
            htmlFor="pg-title"
            required
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input
              id="pg-title"
              placeholder="О группе"
              {...form.register("title")}
              aria-invalid={!!errors.title || undefined}
            />
          </FormField>
          <FormField
            label="Слаг"
            htmlFor="pg-slug"
            description="Адрес страницы: /p/слаг. Пусто — сгенерируется из заголовка."
            error={errors.slug?.message}
          >
            <Input
              id="pg-slug"
              placeholder="o-gruppe"
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
                htmlFor="pg-status"
                error={errors.status?.message}
              >
                <SelectField
                  id="pg-status"
                  value={field.value}
                  onChange={field.onChange}
                  options={STATUS_OPTIONS}
                />
              </FormField>
            )}
          />
          <FormField
            label="Кратко"
            htmlFor="pg-summary"
            description="Показывается в списках и превью ссылок."
            error={errors.summary?.message}
            className="sm:col-span-2"
          >
            <Textarea id="pg-summary" rows={2} {...form.register("summary")} />
          </FormField>
          <FormField
            label="Порядок"
            htmlFor="pg-position"
            description="Порядок в меню и списках."
            error={errors.position?.message}
          >
            <Input
              id="pg-position"
              inputMode="numeric"
              {...form.register("position")}
              aria-invalid={!!errors.position || undefined}
            />
          </FormField>
          <Controller
            control={form.control}
            name="showInNav"
            render={({ field }) => (
              <div className="flex items-center gap-3 self-end pb-1.5">
                <Switch
                  id="pg-nav"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="pg-nav">Показывать в меню сайта</Label>
              </div>
            )}
          />
        </FormGrid>
      </FormSection>
      <FormSection title="Содержимое">
        <Controller
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormField
              label="Текст страницы"
              htmlFor="pg-content"
              error={errors.content?.message}
            >
              <MdxEditor
                id="pg-content"
                value={field.value}
                onChange={field.onChange}
                minHeight="24rem"
              />
            </FormField>
          )}
        />
      </FormSection>
      <FormActions
        backHref="/admin/pages"
        saving={form.formState.isSubmitting}
      />
    </form>
  );
}
