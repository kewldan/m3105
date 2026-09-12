"use client";

import { CircleQuestionMarkIcon, EyeIcon, PencilIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { previewMdx } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Snippet = {
  label: string;
  before: string;
  after?: string;
  placeholder?: string;
  block?: boolean;
};

const SNIPPETS: Snippet[] = [
  { label: "H2", before: "## ", placeholder: "Заголовок", block: true },
  { label: "H3", before: "### ", placeholder: "Подзаголовок", block: true },
  { label: "Жирный", before: "**", after: "**", placeholder: "текст" },
  { label: "Курсив", before: "_", after: "_", placeholder: "текст" },
  { label: "Код", before: "`", after: "`", placeholder: "код" },
  {
    label: "Блок кода",
    before: '```python title="main.py"\n',
    after: "\n```",
    placeholder: "print('hi')",
    block: true,
  },
  { label: "Формула", before: "$", after: "$", placeholder: "E = mc^2" },
  {
    label: "Ссылка",
    before: "[",
    after: "](https://)",
    placeholder: "название",
  },
  { label: "Список", before: "- ", placeholder: "пункт", block: true },
  {
    label: "Таблица",
    before: "| Колонка | Колонка |\n| --- | --- |\n| ",
    after: " | ячейка |",
    placeholder: "ячейка",
    block: true,
  },
  {
    label: "Callout",
    before: '<Callout type="info" title="Заметка">\n',
    after: "\n</Callout>",
    placeholder: "Текст",
    block: true,
  },
  {
    label: "Спойлер",
    before: '<Spoiler title="Показать решение">\n',
    after: "\n</Spoiler>",
    placeholder: "Текст",
    block: true,
  },
];

export const MDX_HELP: { syntax: string; description: string }[] = [
  {
    syntax: "## Заголовок",
    description: "Заголовки второго и третьего уровня попадают в оглавление",
  },
  { syntax: "**жирный**, _курсив_, `код`", description: "Обычный Markdown" },
  {
    syntax: "$x^2$ и $$\\int_0^1 f$$",
    description: "Формулы KaTeX: строчные и выключные",
  },
  {
    syntax: '```go title="main.go" {2}',
    description: "Блок кода с подсветкой, заголовком и выделением строк",
  },
  {
    syntax: '<Callout type="warning" title="…">',
    description: "Врезка: info, tip, warning, danger, success",
  },
  {
    syntax: '<Spoiler title="…">',
    description: "Скрытый блок, раскрывается по клику",
  },
  {
    syntax: "<Steps>1. … 2. …</Steps>",
    description: "Нумерованные шаги с акцентом",
  },
  { syntax: "| a | b |", description: "Таблицы GFM, списки задач - [ ]" },
];

export function MdxHelpButton({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={className}
          />
        }
      >
        <CircleQuestionMarkIcon data-icon="inline-start" />
        Разметка
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,26rem)]">
        <div className="space-y-1">
          <div className="font-medium">Что поддерживает редактор</div>
          <p className="text-xs text-muted-foreground">
            MDX: Markdown плюс несколько компонентов сайта.
          </p>
        </div>
        <ul className="space-y-2 text-xs">
          {MDX_HELP.map((h) => (
            <li key={h.syntax} className="grid gap-0.5">
              <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono">
                {h.syntax}
              </code>
              <span className="text-muted-foreground">{h.description}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Markdown/MDX editor with a debounced server-rendered preview.
 */
export function MdxEditor({
  value,
  onChange,
  id,
  placeholder = "Текст в формате MDX…",
  invalid,
  disabled,
  minHeight = "16rem",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  minHeight?: string;
  className?: string;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [preview, setPreview] = useState<ReactNode>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (tab !== "preview" || previewFor === value) return;
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      previewMdx(value)
        .then((node) => {
          if (cancelled) return;
          setPreview(node);
          setPreviewFor(value);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setPreview(
            <p className="text-sm text-destructive">
              Не удалось построить предпросмотр:{" "}
              {err instanceof Error ? err.message : String(err)}
            </p>,
          );
          setPreviewFor(value);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, value, previewFor]);

  function insert(snippet: Snippet) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const inner = selected || snippet.placeholder || "";
    const needsNewline =
      snippet.block && start > 0 && value[start - 1] !== "\n";
    const text = `${needsNewline ? "\n" : ""}${snippet.before}${inner}${snippet.after ?? ""}`;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const base = start + (needsNewline ? 1 : 0) + snippet.before.length;
      el.setSelectionRange(base, base + inner.length);
    });
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        invalid && "border-destructive",
        className,
      )}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "edit" | "preview")}>
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
          <TabsList className="h-7">
            <TabsTrigger value="edit" className="px-2 text-xs">
              <PencilIcon data-icon="inline-start" />
              Редактор
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-2 text-xs">
              <EyeIcon data-icon="inline-start" />
              Просмотр
            </TabsTrigger>
          </TabsList>
          {tab === "edit" ? (
            <div className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
              {SNIPPETS.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={disabled}
                  onClick={() => insert(s)}
                  className="shrink-0 text-muted-foreground"
                >
                  {s.label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <MdxHelpButton className="shrink-0" />
        </div>
        <TabsContent value="edit">
          <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            onChange={(e) => onChange(e.target.value)}
            spellCheck
            className="min-h-(--editor-min-h) resize-y rounded-none border-0 font-mono text-[13px] leading-relaxed focus-visible:ring-0 dark:bg-transparent"
            style={{ "--editor-min-h": minHeight } as React.CSSProperties}
          />
        </TabsContent>
        <TabsContent value="preview">
          <div
            className="min-h-(--editor-min-h) p-4"
            style={{ "--editor-min-h": minHeight } as React.CSSProperties}
          >
            {previewLoading && preview === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Рендерим…
              </div>
            ) : value.trim() === "" ? (
              <p className="text-sm text-muted-foreground">
                Нечего показывать — текст пустой.
              </p>
            ) : (
              <div
                className={cn(
                  previewLoading && "opacity-60 transition-opacity",
                )}
              >
                {preview}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
