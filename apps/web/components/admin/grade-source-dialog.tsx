"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { EntityDialog } from "@/components/admin/entity-dialog";
import {
  FormField,
  FormGrid,
  FormSection,
} from "@/components/admin/form-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type {
  AdminGradeColumn,
  GradeScheme,
  GradeSource,
  GradeSourceInput,
  Subject,
} from "@/lib/api/types";

/** Columns as "ключ; заголовок; подпись; максимум", one per line. */
function columnsToText(columns: AdminGradeColumn[]): string {
  return columns
    .map((c) => [c.key, c.header, c.label, c.max || ""].join("; "))
    .join("\n");
}

function parseColumns(text: string): AdminGradeColumn[] | string {
  const out: AdminGradeColumn[] = [];
  const lines = text.split("\n").filter((l) => l.trim());
  for (const [i, line] of lines.entries()) {
    const [key = "", header = "", label = "", max = ""] = line
      .split(";")
      .map((s) => s.trim());
    if (!header) return `Строка ${i + 1}: нет заголовка столбца`;
    const n = max === "" ? 0 : Number(max.replace(",", "."));
    if (!Number.isFinite(n) || n < 0)
      return `Строка ${i + 1}: максимум — число`;
    out.push({ key, header, label: label || header, max: n });
  }
  return out;
}

/** "1; 0,85; 0,65" ↔ [1, 0.85, 0.65]. */
function factorsToText(factors: number[]): string {
  return factors.map((f) => String(f).replace(".", ",")).join("; ");
}

function parseFactors(text: string): number[] | string {
  const parts = text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = parts.map((p) => Number(p.replace(",", ".")));
  if (out.some((f) => !Number.isFinite(f) || f < 0 || f > 1))
    return "Числа от 0 до 1 через «;»";
  return out;
}

const schema = z.object({
  subjectId: z
    .number()
    .nullable()
    .refine((v) => v !== null && v > 0, "Выберите предмет"),
  title: z.string().trim().max(80, "Не длиннее 80 символов"),
  spreadsheet: z.string().trim().min(1, "Вставьте ссылку на таблицу"),
  tabPattern: z.string().trim(),
  nameColumn: z.string().trim().min(1, "Укажите столбец"),
  idColumn: z.string().trim(),
  groupColumn: z.string().trim(),
  totalColumn: z.string().trim(),
  maxTotal: z.string().regex(/^\d+([.,]\d+)?$/, "Число"),
  syncHours: z.string().regex(/^\d+$/, "Целое число"),
  enabled: z.boolean(),
  membersOnly: z.boolean(),
  columns: z.string().superRefine((v, ctx) => {
    const res = parseColumns(v);
    if (typeof res === "string") ctx.addIssue({ code: "custom", message: res });
  }),
  labTheory: z.string().trim(),
  labPlus: z.string().trim(),
  labMinus: z.string().trim(),
  labLate: z.string().trim(),
  labBonus: z.string().regex(/^(\d+([.,]\d+)?)?$/, "Число"),
  labFactors: z.string().superRefine((v, ctx) => {
    const res = parseFactors(v);
    if (typeof res === "string") ctx.addIssue({ code: "custom", message: res });
  }),
});

type FormValues = z.infer<typeof schema>;

// Значения под таблицу баллов по программированию: вкладка на группу,
// пять лаб по 12 баллов и экзамен на 40; у лабы блок «- + D 12»: плюсик
// и минус — ±4%, ступени просрочки срезают лабу до 85, 65 и 50%.
const EMPTY: FormValues = {
  subjectId: null,
  title: "",
  spreadsheet: "",
  tabPattern: "^[MМ]\\d{4,5}$",
  nameColumn: "ФИО",
  idColumn: "ИСУ",
  groupColumn: "",
  totalColumn: "Итог",
  maxTotal: "100",
  syncHours: "3",
  enabled: true,
  membersOnly: false,
  columns: columnsToText([
    ...[1, 2, 3, 4, 5].map((n) => ({
      key: `lab${n}`,
      header: String(n),
      label: `Лаба ${n}`,
      max: 12,
    })),
    { key: "exam", header: "Экзамен", label: "Экзамен", max: 40 },
  ]),
  labTheory: "12",
  labPlus: "+",
  labMinus: "-",
  labLate: "D",
  labBonus: "4",
  labFactors: "1; 0,85; 0,65; 0,5",
};

function schemeFromValues(values: FormValues): GradeScheme {
  const factors = parseFactors(values.labFactors);
  return {
    theory: values.labTheory,
    plus: values.labPlus,
    minus: values.labMinus,
    late: values.labLate,
    bonusPercent: Number(values.labBonus.replace(",", ".") || 0),
    lateFactors: typeof factors === "string" ? [] : factors,
  };
}

export function GradeSourceDialog({
  open,
  onOpenChange,
  source,
  subjects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: GradeSource | null;
  subjects: Subject[];
  onSaved: (saved: GradeSource) => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(
      source
        ? {
            subjectId: source.subjectId,
            title: source.title,
            spreadsheet: `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}`,
            tabPattern: source.tabPattern,
            nameColumn: source.nameColumn,
            idColumn: source.idColumn,
            groupColumn: source.groupColumn,
            totalColumn: source.totalColumn,
            maxTotal: String(source.maxTotal),
            syncHours: String(source.syncHours),
            enabled: source.enabled,
            membersOnly: source.membersOnly,
            columns: columnsToText(source.columns),
            labTheory: source.scheme.theory,
            labPlus: source.scheme.plus,
            labMinus: source.scheme.minus,
            labLate: source.scheme.late,
            labBonus: source.scheme.theory
              ? String(source.scheme.bonusPercent).replace(".", ",")
              : "",
            labFactors: factorsToText(source.scheme.lateFactors),
          }
        : EMPTY,
    );
  }, [open, source, reset]);

  async function onSubmit(values: FormValues) {
    const columns = parseColumns(values.columns);
    if (typeof columns === "string") return;
    const input: GradeSourceInput = {
      subjectId: values.subjectId ?? 0,
      title: values.title,
      spreadsheet: values.spreadsheet,
      tabPattern: values.tabPattern,
      nameColumn: values.nameColumn,
      idColumn: values.idColumn,
      groupColumn: values.groupColumn,
      totalColumn: values.totalColumn,
      maxTotal: Number(values.maxTotal.replace(",", ".")),
      syncHours: Number(values.syncHours),
      enabled: values.enabled,
      membersOnly: values.membersOnly,
      columns,
      scheme: schemeFromValues(values),
    };
    try {
      const saved = source
        ? await adminApi.gradeSources.update(source.id, input)
        : await adminApi.gradeSources.create(input);
      toast.success(
        source ? "Источник обновлён" : "Источник добавлен, синхронизирую…",
      );
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
      title={source ? "Источник баллов" : "Новый источник баллов"}
      description="Google-таблица, открытая по ссылке на просмотр. Вкладки — группы, строки — студенты; столбцы ищутся по заголовкам."
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
              htmlFor="gs-subject"
              required
              error={errors.subjectId?.message}
            >
              <SubjectCombobox
                id="gs-subject"
                subjects={subjects}
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.subjectId}
              />
            </FormField>
          )}
        />
        <FormField
          label="Название"
          htmlFor="gs-title"
          description="Пусто — название предмета."
          error={errors.title?.message}
        >
          <Input
            id="gs-title"
            placeholder="Лабы по программированию"
            {...form.register("title")}
          />
        </FormField>
      </FormGrid>
      <FormField
        label="Таблица"
        htmlFor="gs-sheet"
        required
        error={errors.spreadsheet?.message}
      >
        <Input
          id="gs-sheet"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          autoComplete="off"
          {...form.register("spreadsheet")}
          aria-invalid={!!errors.spreadsheet || undefined}
        />
      </FormField>

      <FormSection
        title="Столбцы"
        description="Заголовки как в таблице, без учёта регистра."
      >
        <FormGrid>
          <FormField
            label="ФИО"
            htmlFor="gs-name"
            required
            error={errors.nameColumn?.message}
          >
            <Input id="gs-name" {...form.register("nameColumn")} />
          </FormField>
          <FormField
            label="Номер ИСУ"
            htmlFor="gs-id"
            description="По нему строки связываются с аккаунтами."
          >
            <Input id="gs-id" {...form.register("idColumn")} />
          </FormField>
          <FormField
            label="Итог"
            htmlFor="gs-total"
            description="Пусто или пустая ячейка — сумма разбивки."
            error={errors.totalColumn?.message}
          >
            <Input id="gs-total" {...form.register("totalColumn")} />
          </FormField>
          <FormField
            label="Максимум итога"
            htmlFor="gs-max"
            error={errors.maxTotal?.message}
          >
            <Input
              id="gs-max"
              inputMode="decimal"
              {...form.register("maxTotal")}
            />
          </FormField>
          <FormField
            label="Группа"
            htmlFor="gs-group"
            description="Пусто — группа берётся из названия вкладки."
          >
            <Input id="gs-group" {...form.register("groupColumn")} />
          </FormField>
          <FormField
            label="Вкладки"
            htmlFor="gs-tabs"
            description="Регулярка по названиям; пусто — все, где нашлись столбцы."
            error={errors.tabPattern?.message}
          >
            <Input
              id="gs-tabs"
              className="font-mono"
              {...form.register("tabPattern")}
            />
          </FormField>
        </FormGrid>
        <FormField
          label="Разбивка"
          htmlFor="gs-columns"
          description="По строке на столбец: ключ; заголовок в таблице; подпись на сайте; максимум. Максимум, если в таблице есть строка «max…», при синке берётся оттуда. Ключ не меняйте — по нему бот сравнивает старые и новые баллы."
          error={errors.columns?.message}
        >
          <Textarea
            id="gs-columns"
            rows={6}
            className="font-mono text-xs"
            {...form.register("columns")}
            aria-invalid={!!errors.columns || undefined}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Лабы с модификаторами"
        description="Если у лабы слева от её итога есть блок столбцов — теормин, плюсы, минусы, ступень просрочки, — сайт покажет, какие лабы ждут теормина и сколько за них можно получить, и устроит рейтинг плюсиков. Блок ищется у каждого столбца разбивки отдельно, так что одинаковые заголовки у разных лаб не мешают. Пустой теормин — схемы нет."
      >
        <FormGrid>
          <FormField
            label="Теормин"
            htmlFor="gs-theory"
            description="Баллы за лабу без модификаторов."
          >
            <Input id="gs-theory" {...form.register("labTheory")} />
          </FormField>
          <FormField label="Ступень просрочки" htmlFor="gs-late">
            <Input id="gs-late" {...form.register("labLate")} />
          </FormField>
          <FormField label="Плюсики" htmlFor="gs-plus">
            <Input id="gs-plus" {...form.register("labPlus")} />
          </FormField>
          <FormField label="Минусы" htmlFor="gs-minus">
            <Input id="gs-minus" {...form.register("labMinus")} />
          </FormField>
          <FormField
            label="Плюсик, %"
            htmlFor="gs-bonus"
            description="Сколько добавляет плюсик и отнимает минус."
            error={errors.labBonus?.message}
          >
            <Input
              id="gs-bonus"
              inputMode="decimal"
              {...form.register("labBonus")}
            />
          </FormField>
          <FormField
            label="Коэффициенты просрочки"
            htmlFor="gs-factors"
            description="По ступеням, с нулевой (в срок); дальше — последний. При синке сверяются с итогами лаб в таблице."
            error={errors.labFactors?.message}
          >
            <Input
              id="gs-factors"
              className="font-mono"
              {...form.register("labFactors")}
            />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormGrid>
        <FormField
          label="Синхронизация, часов"
          htmlFor="gs-hours"
          description="Как часто перечитывать таблицу (1–168)."
          error={errors.syncHours?.message}
        >
          <Input
            id="gs-hours"
            inputMode="numeric"
            {...form.register("syncHours")}
          />
        </FormField>
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormField
              label="На сайте"
              htmlFor="gs-enabled"
              description="Выключенный источник не синхронизируется и скрыт."
            >
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id="gs-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="gs-enabled" className="font-normal">
                  {field.value ? "Показывается" : "Скрыт"}
                </Label>
              </div>
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="membersOnly"
          render={({ field }) => (
            <FormField
              label="Кому видно"
              htmlFor="gs-members"
              description="Для таблиц одной небольшой группы, например языковой по английскому: остальным источник не показывается, места считаются внутри таблицы."
              className="sm:col-span-2"
            >
              <div className="flex h-9 items-center gap-2">
                <Switch
                  id="gs-members"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor="gs-members" className="font-normal">
                  {field.value
                    ? "Только тем, кто есть в таблице"
                    : "Всем подтверждённым студентам"}
                </Label>
              </div>
            </FormField>
          )}
        />
      </FormGrid>
    </EntityDialog>
  );
}
