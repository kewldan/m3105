"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SaveIcon, SendIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ComboboxField } from "@/components/admin/combobox-field";
import { DatePicker } from "@/components/admin/date-picker";
import {
  FormField,
  FormGrid,
  FormSection,
} from "@/components/admin/form-field";
import { LinksEditor } from "@/components/admin/links-editor";
import { PageTitle } from "@/components/admin/page-title";
import { SelectField } from "@/components/admin/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { PARITY_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/admin/options";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Settings } from "@/lib/api/types";

const schema = z.object({
  siteTitle: z.string().trim().min(1, "Укажите название сайта"),
  groupName: z.string().trim().min(1, "Укажите название группы"),
  description: z.string(),
  semesterStart: z.string().nullable(),
  semesterEnd: z.string().nullable(),
  firstWeekParity: z.enum(["odd", "even"]),
  timezone: z.string().min(1, "Выберите часовой пояс"),
  links: z.array(z.object({ title: z.string(), url: z.string() })),
  inviteCode: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

function toForm(s: Settings): FormValues {
  return {
    siteTitle: s.siteTitle,
    groupName: s.groupName,
    description: s.description,
    semesterStart: s.semesterStart,
    semesterEnd: s.semesterEnd,
    firstWeekParity: s.firstWeekParity,
    timezone: s.timezone,
    links: s.links ?? [],
    inviteCode: s.inviteCode ?? "",
  };
}

export default function SettingsPage() {
  const { data, loading, error, setData } = useQuery(() =>
    adminApi.settings.get(),
  );
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      siteTitle: "",
      groupName: "",
      description: "",
      semesterStart: null,
      semesterEnd: null,
      firstWeekParity: "odd",
      timezone: "Europe/Moscow",
      links: [],
      inviteCode: "",
    },
  });
  const { reset } = form;

  useEffect(() => {
    if (data) reset(toForm(data));
  }, [data, reset]);

  const tzOptions = useMemo(() => {
    const current = form.getValues("timezone");
    if (current && !TIMEZONE_OPTIONS.some((o) => o.value === current)) {
      return [{ value: current, label: current }, ...TIMEZONE_OPTIONS];
    }
    return TIMEZONE_OPTIONS;
  }, [form]);

  async function onSubmit(values: FormValues) {
    try {
      const saved = await adminApi.settings.update({
        ...values,
        updatedAt: data?.updatedAt ?? "",
      });
      setData(saved);
      reset(toForm(saved));
      toast.success("Настройки сохранены");
    } catch (err) {
      handleApiError(err, form.setError);
    }
  }

  const errors = form.formState.errors;

  if (error)
    return (
      <p className="text-sm text-destructive">
        Не удалось загрузить настройки: {error.message}
      </p>
    );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <PageTitle
        title="Настройки"
        description="Название сайта, семестр, ссылки и правила входа студентов."
        actions={
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || loading}
          >
            {form.formState.isSubmitting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            Сохранить
          </Button>
        }
      />

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <FormSection
            title="Сайт"
            description="Отображается в шапке и заголовке вкладки."
          >
            <FormGrid>
              <FormField
                label="Название сайта"
                htmlFor="siteTitle"
                required
                error={errors.siteTitle?.message}
              >
                <Input
                  id="siteTitle"
                  {...form.register("siteTitle")}
                  aria-invalid={!!errors.siteTitle || undefined}
                />
              </FormField>
              <FormField
                label="Название группы"
                htmlFor="groupName"
                required
                error={errors.groupName?.message}
              >
                <Input
                  id="groupName"
                  {...form.register("groupName")}
                  aria-invalid={!!errors.groupName || undefined}
                />
              </FormField>
            </FormGrid>
            <FormField
              label="Описание"
              htmlFor="description"
              description="Короткий текст для главной страницы и превью ссылок."
              error={errors.description?.message}
            >
              <Textarea
                id="description"
                rows={3}
                {...form.register("description")}
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Семестр"
            description="Нужен для определения номера недели и её чётности (чётная/нечётная) в шапке сайта."
          >
            <FormGrid>
              <Controller
                control={form.control}
                name="semesterStart"
                render={({ field }) => (
                  <FormField
                    label="Начало семестра"
                    htmlFor="semesterStart"
                    error={errors.semesterStart?.message}
                  >
                    <DatePicker
                      id="semesterStart"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="semesterEnd"
                render={({ field }) => (
                  <FormField
                    label="Конец семестра"
                    htmlFor="semesterEnd"
                    error={errors.semesterEnd?.message}
                  >
                    <DatePicker
                      id="semesterEnd"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="firstWeekParity"
                render={({ field }) => (
                  <FormField
                    label="Первая неделя семестра"
                    htmlFor="firstWeekParity"
                    description="Какой по чётности считается неделя, в которую начался семестр."
                    error={errors.firstWeekParity?.message}
                  >
                    <SelectField
                      id="firstWeekParity"
                      value={field.value}
                      onChange={field.onChange}
                      options={PARITY_OPTIONS}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormField
                    label="Часовой пояс"
                    htmlFor="timezone"
                    required
                    error={errors.timezone?.message}
                  >
                    <ComboboxField
                      id="timezone"
                      options={tzOptions}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? "")}
                      invalid={!!errors.timezone}
                      placeholder="Europe/Moscow"
                    />
                  </FormField>
                )}
              />
            </FormGrid>
          </FormSection>

          <FormSection
            title="Ссылки"
            description="Чат группы, облако с материалами и прочее — показываются в шапке и подвале."
          >
            <Controller
              control={form.control}
              name="links"
              render={({ field }) => (
                <FormField
                  label="Список ссылок"
                  error={errors.links?.message ?? errors.links?.root?.message}
                >
                  <LinksEditor value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
          </FormSection>

          <FormSection
            title="Вход студентов"
            description="Аккаунты создаются при первом входе через Telegram, паролей нет. Новый аккаунт ждёт подтверждения в разделе «Студенты», там же задаётся имя и фамилия."
          >
            <FormField
              label="Код доступа"
              htmlFor="inviteCode"
              description="Кто введёт этот код при первом входе, подтверждается сразу, без ручной проверки. Пусто — всех подтверждаете вручную. На уже вошедших не влияет."
              error={errors.inviteCode?.message}
            >
              <Input
                id="inviteCode"
                autoComplete="off"
                placeholder="например, m3105-2026"
                {...form.register("inviteCode")}
                aria-invalid={!!errors.inviteCode || undefined}
              />
            </FormField>
            <div className="rounded-xl border bg-muted/40 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <SendIcon className="size-4 text-primary" aria-hidden />
                Вход через Telegram
              </div>
              <p className="mt-2 text-muted-foreground">
                Кнопка входа появится на сайте, когда у API заданы переменные
                окружения. Настраивается на сервере, не здесь.
              </p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                <li>
                  Создайте бота в{" "}
                  <span className="font-medium text-foreground">
                    @BotFather
                  </span>{" "}
                  командой{" "}
                  <code className="rounded bg-muted px-1">/newbot</code>.
                </li>
                <li>
                  Там же выполните{" "}
                  <code className="rounded bg-muted px-1">/setdomain</code> и
                  укажите домен сайта, например{" "}
                  <span className="font-medium text-foreground">m3105.ru</span>.
                </li>
                <li>
                  Положите в <code className="rounded bg-muted px-1">.env</code>{" "}
                  <code className="rounded bg-muted px-1">
                    TELEGRAM_BOT_TOKEN
                  </code>{" "}
                  (токен от BotFather) и{" "}
                  <code className="rounded bg-muted px-1">
                    TELEGRAM_BOT_USERNAME
                  </code>{" "}
                  (имя бота без @), затем перезапустите{" "}
                  <code className="rounded bg-muted px-1">docker compose</code>.
                </li>
              </ol>
              <p className="mt-3 text-muted-foreground">
                Пасскеи работают сразу, им нужен только HTTPS.
              </p>
            </div>
          </FormSection>

          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              Сохранить
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
