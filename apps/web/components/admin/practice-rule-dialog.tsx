"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AudiencePicker } from "@/components/admin/audience-picker";
import { DatePicker } from "@/components/admin/date-picker";
import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField, FormGrid } from "@/components/admin/form-field";
import { SubjectCombobox } from "@/components/admin/subject-combobox";
import { TimeInput } from "@/components/admin/time-input";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TIME_RE } from "@/lib/admin/datetime";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import { ApiError, apiClient } from "@/lib/api/client";
import type {
  PracticeRule,
  PracticeRuleInput,
  PracticeRulePlanAction,
  PracticeRulePlanItem,
  RuleWeeks,
  SettingsResponse,
  Subject,
} from "@/lib/api/types";
import { fmtTime, fmtWeekdayDate, toYmd, WEEKDAYS_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";

const schema = z
  .object({
    audience: z.array(z.string()),
    subjectId: z
      .number()
      .nullable()
      .refine((v) => v !== null && v > 0, "Выберите предмет"),
    weekday: z.number().int().min(1, "Выберите день").max(7),
    startTime: z.string().regex(TIME_RE, "ЧЧ:ММ"),
    endTime: z
      .string()
      .refine((v) => v === "" || TIME_RE.test(v), "ЧЧ:ММ или пусто"),
    weeks: z.enum(["all", "odd", "even"]),
    startsOn: z
      .string()
      .nullable()
      .refine((v) => !!v, "С какого дня"),
    endsOn: z
      .string()
      .nullable()
      .refine((v) => !!v, "По какой день"),
    location: z.string().trim(),
    capacity: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d+$/.test(v), "Целое число или пусто"),
    note: z.string().trim(),
  })
  .refine((v) => !v.endTime || v.endTime > v.startTime, {
    path: ["endTime"],
    message: "Окончание раньше начала",
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, {
    path: ["endsOn"],
    message: "Конец раньше начала",
  });

type FormValues = z.infer<typeof schema>;

function toInput(v: FormValues): PracticeRuleInput {
  return {
    audience: v.audience,
    subjectId: v.subjectId ?? 0,
    weekday: v.weekday,
    startTime: v.startTime,
    endTime: v.endTime,
    weeks: v.weeks,
    startsOn: v.startsOn ?? "",
    endsOn: v.endsOn ?? "",
    location: v.location.trim(),
    capacity: v.capacity.trim() === "" ? null : Number(v.capacity),
    note: v.note.trim(),
  };
}

const WEEKS: { value: RuleWeeks; label: string }[] = [
  { value: "all", label: "Каждую" },
  { value: "odd", label: "Нечётные" },
  { value: "even", label: "Чётные" },
];

export const PLAN_LABEL: Record<
  PracticeRulePlanAction,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive" | "ghost";
  }
> = {
  create: { label: "создастся", variant: "default" },
  adopt: { label: "привяжется", variant: "secondary" },
  update: { label: "обновится", variant: "secondary" },
  keep: { label: "без изменений", variant: "ghost" },
  manual: { label: "изменено вручную, не тронется", variant: "outline" },
  canceled: { label: "отменено", variant: "outline" },
  past: { label: "прошло", variant: "ghost" },
  delete: { label: "удалится", variant: "destructive" },
  cancel: {
    label: "отменится, записавшимся придёт сообщение",
    variant: "destructive",
  },
  detach: { label: "станет разовой", variant: "outline" },
};

/** What saving the rule does to each date, recomputed as the form changes. */
function RulePreview({
  ruleId,
  values,
}: {
  ruleId: number | null;
  values: FormValues;
}) {
  const [items, setItems] = useState<PracticeRulePlanItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const parsed = schema.safeParse(values);
  const key = parsed.success ? JSON.stringify(toInput(parsed.data)) : "";

  useEffect(() => {
    if (!key) {
      setItems(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      adminApi.practiceRules
        .preview(JSON.parse(key) as PracticeRuleInput, ruleId)
        .then((res) => {
          if (!live) return;
          setItems(res);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!live) return;
          setItems(null);
          setError(
            err instanceof ApiError
              ? (Object.values(err.fields ?? {})[0] ?? err.message)
              : "Не удалось построить предпросмотр",
          );
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, ruleId]);

  const upcoming = (items ?? []).filter((i) => i.action !== "past");
  return (
    <div className="sm:col-span-2 space-y-2 rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        Даты
        {items ? (
          <span className="font-normal text-muted-foreground">
            {
              upcoming.filter(
                (i) =>
                  !["delete", "cancel", "detach", "canceled"].includes(
                    i.action,
                  ),
              ).length
            }{" "}
            занятий впереди
          </span>
        ) : null}
        {loading ? <Spinner className="size-3.5" /> : null}
      </div>
      {!key ? (
        <p className="text-sm text-muted-foreground">
          Заполните предмет, день, время и период — здесь появятся даты.
        </p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : items && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          В этом периоде нет подходящих дней.
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">
          {(items ?? []).map((it) => {
            const l = PLAN_LABEL[it.action];
            return (
              <li
                key={`${it.day}-${it.action}-${it.sessionId ?? ""}`}
                className={cn(
                  "flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums",
                  (it.action === "past" || it.action === "keep") &&
                    "text-muted-foreground",
                )}
              >
                <span className="w-44 shrink-0">
                  {fmtWeekdayDate(it.startsAt)}
                </span>
                <span className="w-24 shrink-0 text-muted-foreground">
                  {fmtTime(it.startsAt)}
                  {it.endsAt ? `–${fmtTime(it.endsAt)}` : ""}
                </span>
                <Badge variant={l.variant}>{l.label}</Badge>
                {it.differs ? (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    время, место или лимит другие — останется как есть
                  </span>
                ) : null}
                {it.signups > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    записей: {it.signups}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PracticeRuleDialog({
  open,
  onOpenChange,
  rule,
  subjects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: PracticeRule | null;
  subjects: Subject[];
  onSaved: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      audience: [],
      subjectId: null,
      weekday: 1,
      startTime: "",
      endTime: "",
      weeks: "all",
      startsOn: null,
      endsOn: null,
      location: "",
      capacity: "",
      note: "",
    },
  });
  const { reset } = form;
  const values = useWatch({ control: form.control }) as FormValues;

  useEffect(() => {
    if (!open) return;
    if (rule) {
      reset({
        audience: rule.audience ?? [],
        subjectId: rule.subjectId,
        weekday: rule.weekday,
        startTime: rule.startTime,
        endTime: rule.endTime,
        weeks: rule.weeks,
        startsOn: rule.startsOn,
        endsOn: rule.endsOn,
        location: rule.location,
        capacity: rule.capacity != null ? String(rule.capacity) : "",
        note: rule.note,
      });
      return;
    }
    const today = toYmd(new Date());
    reset({
      audience: [],
      subjectId: null,
      weekday: 1,
      startTime: "",
      endTime: "",
      weeks: "all",
      startsOn: today,
      endsOn: null,
      location: "",
      capacity: "",
      note: "",
    });
    // По умолчанию — до конца семестра из настроек.
    let live = true;
    apiClient<SettingsResponse>("/settings")
      .then((s) => {
        const end = s.settings.semesterEnd;
        if (live && end && end >= today && !form.getValues("endsOn"))
          form.setValue("endsOn", end);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, rule, reset, form]);

  async function onSubmit(v: FormValues) {
    const input = toInput(v);
    try {
      if (rule) await adminApi.practiceRules.update(rule.id, input);
      else await adminApi.practiceRules.create(input);
      toast.success(rule ? "Правило обновлено" : "Регулярная сдача добавлена");
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
      title={rule ? "Правило сдачи" : "Регулярная сдача"}
      description="Занятия по правилу создаются сразу на весь период. Отменить или перенести одно занятие можно в списке занятий — правило его потом не тронет."
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
              htmlFor="rule-subject"
              required
              error={errors.subjectId?.message}
              className="sm:col-span-2"
            >
              <SubjectCombobox
                id="rule-subject"
                subjects={subjects}
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  const s = subjects.find((x) => x.id === v);
                  if (!rule && s) form.setValue("audience", s.audience);
                }}
                invalid={!!errors.subjectId}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="weekday"
          render={({ field }) => (
            <FormField
              label="День недели"
              required
              error={errors.weekday?.message}
              className="sm:col-span-2"
            >
              <ToggleGroup
                value={[String(field.value)]}
                onValueChange={(v) => {
                  if (v[0]) field.onChange(Number(v[0]));
                }}
                variant="outline"
                spacing={0}
                aria-label="День недели"
              >
                {WEEKDAYS_SHORT.map((d, i) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(i + 1)}
                    className="min-w-11 aria-pressed:bg-muted data-pressed:bg-muted"
                  >
                    {d}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="startTime"
          render={({ field }) => (
            <FormField
              label="Начало"
              htmlFor="rule-start"
              required
              error={errors.startTime?.message}
            >
              <TimeInput
                id="rule-start"
                value={field.value}
                onChange={field.onChange}
                placeholder="20:30"
                invalid={!!errors.startTime}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="endTime"
          render={({ field }) => (
            <FormField
              label="Окончание"
              htmlFor="rule-end"
              description="Необязательно, для календаря."
              error={errors.endTime?.message}
            >
              <TimeInput
                id="rule-end"
                value={field.value}
                onChange={field.onChange}
                placeholder="22:00"
                invalid={!!errors.endTime}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="weeks"
          render={({ field }) => (
            <FormField
              label="Недели"
              description="Чётность — от начала семестра в настройках."
              error={errors.weeks?.message}
              className="sm:col-span-2"
            >
              <ToggleGroup
                value={[field.value]}
                onValueChange={(v) => {
                  if (v[0]) field.onChange(v[0]);
                }}
                variant="outline"
                spacing={0}
                aria-label="Недели"
              >
                {WEEKS.map((w) => (
                  <ToggleGroupItem
                    key={w.value}
                    value={w.value}
                    className="aria-pressed:bg-muted data-pressed:bg-muted"
                  >
                    {w.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="startsOn"
          render={({ field }) => (
            <FormField
              label="С"
              htmlFor="rule-from"
              required
              error={errors.startsOn?.message}
            >
              <DatePicker
                id="rule-from"
                value={field.value}
                onChange={field.onChange}
                allowClear={false}
                invalid={!!errors.startsOn}
              />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="endsOn"
          render={({ field }) => (
            <FormField
              label="По"
              htmlFor="rule-to"
              required
              description="Обычно — конец семестра."
              error={errors.endsOn?.message}
            >
              <DatePicker
                id="rule-to"
                value={field.value}
                onChange={field.onChange}
                allowClear={false}
                invalid={!!errors.endsOn}
              />
            </FormField>
          )}
        />
        <FormField
          label="Аудитория"
          htmlFor="rule-location"
          error={errors.location?.message}
        >
          <Input
            id="rule-location"
            placeholder="412"
            {...form.register("location")}
          />
        </FormField>
        <FormField
          label="Защит за пару"
          htmlFor="rule-capacity"
          description="Остальные записи — резерв. Пусто — без резерва."
          error={errors.capacity?.message}
        >
          <Input
            id="rule-capacity"
            inputMode="numeric"
            placeholder="10"
            {...form.register("capacity")}
            aria-invalid={!!errors.capacity || undefined}
          />
        </FormField>
        <FormField
          label="Заметка"
          htmlFor="rule-note"
          description="Видна студентам при записи на каждое занятие."
          error={errors.note?.message}
          className="sm:col-span-2"
        >
          <Textarea id="rule-note" rows={2} {...form.register("note")} />
        </FormField>
        <Controller
          control={form.control}
          name="audience"
          render={({ field }) => (
            <FormField
              label="Для кого"
              description="Разовые сдачи предмета для той же аудитории на даты правила к нему привяжутся вместе с записями."
              error={errors.audience?.message}
              className="sm:col-span-2"
            >
              <AudiencePicker value={field.value} onChange={field.onChange} />
            </FormField>
          )}
        />
        {open ? (
          <RulePreview ruleId={rule?.id ?? null} values={values} />
        ) : null}
      </FormGrid>
    </EntityDialog>
  );
}
