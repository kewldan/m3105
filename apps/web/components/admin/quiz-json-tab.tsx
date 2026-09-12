"use client";

import { BadgeCheckIcon, ClipboardCopyIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type { QuizQuestion } from "@/lib/api/types";

export type QuizJsonPayload = {
  title?: string;
  description?: string;
  questions: QuizQuestion[];
};

const EXAMPLE = `{
  "title": "Лекция 3. Указатели",
  "description": "Быстрая проверка после лекции",
  "questions": [
    {
      "type": "single",
      "prompt": "Что возвращает \`sizeof(int*)\` на 64-битной системе?",
      "options": [
        { "text": "4 байта", "correct": false },
        { "text": "8 байт", "correct": true }
      ],
      "explanation": "Размер указателя определяется разрядностью адреса."
    },
    {
      "type": "multiple",
      "prompt": "Какие операции допустимы над указателями?",
      "options": [
        { "text": "Сложение с целым", "correct": true },
        { "text": "Разность указателей", "correct": true },
        { "text": "Умножение", "correct": false }
      ]
    },
    {
      "type": "text",
      "prompt": "Как называется указатель, который никуда не указывает?",
      "answers": ["нулевой", "null", "nullptr"]
    }
  ]
}`;

/**
 * JSON view of the quiz: validate on the server, apply to the builder, copy.
 */
export function QuizJsonTab({
  current,
  onApply,
}: {
  current: QuizJsonPayload;
  onApply: (payload: QuizJsonPayload) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(current, null, 2));
  const [validating, setValidating] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  function parse(): QuizJsonPayload | null {
    try {
      const raw: unknown = JSON.parse(text);
      if (Array.isArray(raw)) return { questions: raw as QuizQuestion[] };
      if (
        raw &&
        typeof raw === "object" &&
        Array.isArray((raw as QuizJsonPayload).questions)
      ) {
        const o = raw as QuizJsonPayload;
        return {
          title: o.title,
          description: o.description,
          questions: o.questions,
        };
      }
      setParseError("Ожидается объект с полем questions или массив вопросов");
      return null;
    } catch (err) {
      setParseError(
        `Некорректный JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async function validate() {
    setParseError(null);
    const payload = parse();
    if (!payload) return;
    setValidating(true);
    try {
      const res = await adminApi.quizzes.validate(payload.questions);
      toast.success(`Формат верный: вопросов — ${res.questions.length}`);
      setText(
        JSON.stringify({ ...payload, questions: res.questions }, null, 2),
      );
    } catch (err) {
      handleApiError(err);
    } finally {
      setValidating(false);
    }
  }

  function apply() {
    setParseError(null);
    const payload = parse();
    if (!payload) return;
    onApply(payload);
    toast.success("Данные перенесены в конструктор");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={validate}
          disabled={validating}
        >
          {validating ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <BadgeCheckIcon data-icon="inline-start" />
          )}
          Проверить
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={apply}>
          <DownloadIcon data-icon="inline-start" />
          Применить в конструктор
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={copy}>
          <ClipboardCopyIcon data-icon="inline-start" />
          Скопировать
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setText(JSON.stringify(current, null, 2))}
        >
          Обновить из конструктора
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParseError(null);
        }}
        spellCheck={false}
        aria-invalid={parseError ? true : undefined}
        className="min-h-[28rem] font-mono text-[13px] leading-relaxed"
      />
      {parseError ? (
        <p className="text-sm text-destructive">{parseError}</p>
      ) : null}
      <Collapsible className="rounded-xl border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium hover:bg-muted/50">
          Формат квиза и пример
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 border-t px-4 py-3 text-sm">
          <ul className="space-y-1 text-muted-foreground">
            <li>
              <code className="rounded bg-muted px-1">type</code>:{" "}
              <code className="rounded bg-muted px-1">single</code> — один
              верный вариант,{" "}
              <code className="rounded bg-muted px-1">multiple</code> —
              несколько, <code className="rounded bg-muted px-1">text</code> —
              свободный ввод.
            </li>
            <li>
              <code className="rounded bg-muted px-1">prompt</code> — текст
              вопроса (Markdown, формулы), обязателен.
            </li>
            <li>
              <code className="rounded bg-muted px-1">options</code> — минимум
              два, у single ровно один{" "}
              <code className="rounded bg-muted px-1">correct</code>.
            </li>
            <li>
              <code className="rounded bg-muted px-1">answers</code> — список
              принимаемых ответов для text.
            </li>
            <li>
              Необязательно: <code className="rounded bg-muted px-1">id</code>,{" "}
              <code className="rounded bg-muted px-1">explanation</code>,{" "}
              <code className="rounded bg-muted px-1">points</code>,{" "}
              <code className="rounded bg-muted px-1">tags</code>. Полное
              описание — docs/quiz-format.md в репозитории.
            </li>
          </ul>
          <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed">
            {EXAMPLE}
          </pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setText(EXAMPLE)}
          >
            Подставить пример
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
