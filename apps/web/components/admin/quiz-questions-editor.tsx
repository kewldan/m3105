// biome-ignore-all lint/suspicious/noArrayIndexKey: rows are positional and have no stable identity
"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";

import { FormField, FormGrid } from "@/components/admin/form-field";
import { SelectField } from "@/components/admin/select-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Option } from "@/lib/admin/options";
import type { QuestionType, QuizOption, QuizQuestion } from "@/lib/api/types";

const TYPE_OPTIONS: Option<QuestionType>[] = [
  { value: "single", label: "Один верный вариант" },
  { value: "multiple", label: "Несколько верных" },
  { value: "text", label: "Свободный ответ" },
];

function nextId(prefix: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function newQuestion(
  existing: QuizQuestion[],
  type: QuestionType = "single",
): QuizQuestion {
  const id = nextId("q", new Set(existing.map((q) => q.id)));
  const base: QuizQuestion = {
    id,
    type,
    prompt: "",
    explanation: "",
    points: 1,
  };
  if (type === "text") return { ...base, answers: [""] };
  return {
    ...base,
    options: [
      { id: `${id}-1`, text: "", correct: true },
      { id: `${id}-2`, text: "", correct: false },
    ],
  };
}

/** Builder for the questions array. Fully controlled; ids are kept unique. */
export function QuizQuestionsEditor({
  value,
  onChange,
}: {
  value: QuizQuestion[];
  onChange: (qs: QuizQuestion[]) => void;
}) {
  function update(i: number, patch: Partial<QuizQuestion>) {
    onChange(value.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function duplicate(i: number) {
    const src = value[i];
    const id = nextId("q", new Set(value.map((q) => q.id)));
    const copy: QuizQuestion = {
      ...src,
      id,
      options: src.options?.map((o, k) => ({ ...o, id: `${id}-${k + 1}` })),
      answers: src.answers ? [...src.answers] : undefined,
      tags: src.tags ? [...src.tags] : undefined,
    };
    onChange([...value.slice(0, i + 1), copy, ...value.slice(i + 1)]);
  }
  function changeType(i: number, type: QuestionType) {
    const q = value[i];
    if (q.type === type) return;
    if (type === "text") {
      update(i, {
        type,
        options: undefined,
        answers: q.answers?.length ? q.answers : [""],
      });
      return;
    }
    let options: QuizOption[] = q.options ?? [];
    if (options.length < 2) {
      options = [
        { id: `${q.id}-1`, text: "", correct: true },
        { id: `${q.id}-2`, text: "", correct: false },
      ];
    }
    if (type === "single") {
      let seen = false;
      options = options.map((o) => {
        if (o.correct && !seen) {
          seen = true;
          return o;
        }
        return { ...o, correct: false };
      });
      if (!seen) options = options.map((o, k) => ({ ...o, correct: k === 0 }));
    }
    update(i, { type, options, answers: undefined });
  }

  return (
    <div className="space-y-4">
      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Вопросов пока нет. Добавьте первый или вставьте JSON на соседней
          вкладке.
        </p>
      ) : null}
      {value.map((q, i) => (
        <div
          key={q.id}
          className="animate-fade-in space-y-4 rounded-xl border bg-card p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              {i + 1}
            </Badge>
            <span className="text-xs text-muted-foreground">id: {q.id}</span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Выше"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ниже"
              disabled={i === value.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Дублировать"
              onClick={() => duplicate(i)}
            >
              <CopyIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Удалить вопрос"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              <TrashIcon />
            </Button>
          </div>

          <FormGrid>
            <FormField label="Тип" htmlFor={`${q.id}-type`}>
              <SelectField
                id={`${q.id}-type`}
                value={q.type}
                onChange={(t) => changeType(i, t)}
                options={TYPE_OPTIONS}
              />
            </FormField>
            <FormField label="Баллы" htmlFor={`${q.id}-points`}>
              <Input
                id={`${q.id}-points`}
                inputMode="numeric"
                value={q.points ?? 1}
                onChange={(e) =>
                  update(i, {
                    points: Math.max(
                      1,
                      Number(e.target.value.replace(/\D/g, "")) || 1,
                    ),
                  })
                }
              />
            </FormField>
          </FormGrid>

          <FormField
            label="Вопрос"
            htmlFor={`${q.id}-prompt`}
            required
            description="Поддерживается Markdown и формулы $…$."
          >
            <Textarea
              id={`${q.id}-prompt`}
              rows={2}
              value={q.prompt}
              onChange={(e) => update(i, { prompt: e.target.value })}
              placeholder="Текст вопроса"
            />
          </FormField>

          {q.type === "text" ? (
            <FormField
              label="Принимаемые ответы"
              description="Любой из вариантов засчитывается. Регистр, пробелы и ё/е не важны."
            >
              <div className="space-y-2">
                {(q.answers ?? []).map((a, k) => (
                  <div key={k} className="flex gap-2">
                    <Input
                      value={a}
                      placeholder={`Вариант ответа ${k + 1}`}
                      onChange={(e) =>
                        update(i, {
                          answers: (q.answers ?? []).map((x, idx) =>
                            idx === k ? e.target.value : x,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить ответ"
                      disabled={(q.answers ?? []).length <= 1}
                      onClick={() =>
                        update(i, {
                          answers: (q.answers ?? []).filter(
                            (_, idx) => idx !== k,
                          ),
                        })
                      }
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update(i, { answers: [...(q.answers ?? []), ""] })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Ещё вариант
                </Button>
              </div>
            </FormField>
          ) : (
            <FormField
              label="Варианты ответа"
              description={
                q.type === "single"
                  ? "Отметьте ровно один верный."
                  : "Отметьте все верные варианты."
              }
            >
              <div className="space-y-2">
                {(q.options ?? []).map((o, k) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <Label
                      htmlFor={`${o.id}-correct`}
                      className="flex w-20 shrink-0 items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Checkbox
                        id={`${o.id}-correct`}
                        checked={o.correct}
                        onCheckedChange={(checked) =>
                          update(i, {
                            options: (q.options ?? []).map((x, idx) =>
                              q.type === "single"
                                ? { ...x, correct: idx === k ? checked : false }
                                : idx === k
                                  ? { ...x, correct: checked }
                                  : x,
                            ),
                          })
                        }
                      />
                      верный
                    </Label>
                    <Input
                      value={o.text}
                      placeholder={`Вариант ${k + 1}`}
                      aria-label={`Вариант ${k + 1}`}
                      onChange={(e) =>
                        update(i, {
                          options: (q.options ?? []).map((x, idx) =>
                            idx === k ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить вариант"
                      disabled={(q.options ?? []).length <= 2}
                      onClick={() =>
                        update(i, {
                          options: (q.options ?? []).filter(
                            (_, idx) => idx !== k,
                          ),
                        })
                      }
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const taken = new Set((q.options ?? []).map((o) => o.id));
                    update(i, {
                      options: [
                        ...(q.options ?? []),
                        {
                          id: nextId(`${q.id}-`, taken),
                          text: "",
                          correct: false,
                        },
                      ],
                    });
                  }}
                >
                  <PlusIcon data-icon="inline-start" />
                  Ещё вариант
                </Button>
              </div>
            </FormField>
          )}

          <FormGrid>
            <FormField
              label="Пояснение"
              htmlFor={`${q.id}-explanation`}
              description="Показывается после ответа."
            >
              <Textarea
                id={`${q.id}-explanation`}
                rows={2}
                value={q.explanation ?? ""}
                onChange={(e) => update(i, { explanation: e.target.value })}
              />
            </FormField>
            <FormField
              label="Теги"
              htmlFor={`${q.id}-tags`}
              description="Через запятую."
            >
              <Input
                id={`${q.id}-tags`}
                value={(q.tags ?? []).join(", ")}
                placeholder="указатели, память"
                onChange={(e) =>
                  update(i, {
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </FormField>
          </FormGrid>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, newQuestion(value, "single")])}
        >
          <PlusIcon data-icon="inline-start" />
          Один вариант
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, newQuestion(value, "multiple")])}
        >
          <PlusIcon data-icon="inline-start" />
          Несколько вариантов
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, newQuestion(value, "text")])}
        >
          <PlusIcon data-icon="inline-start" />
          Свободный ответ
        </Button>
      </div>
    </div>
  );
}
