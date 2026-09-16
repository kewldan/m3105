"use client";

import {
  BookOpenIcon,
  FileTextIcon,
  FlaskConicalIcon,
  HelpCircleIcon,
  ListChecksIcon,
  SearchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { apiClient } from "@/lib/api/client";
import type { SearchResult } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const KIND: Record<
  SearchResult["kind"],
  { label: string; icon: typeof BookOpenIcon }
> = {
  note: { label: "Конспекты", icon: BookOpenIcon },
  lab: { label: "Лабы", icon: FlaskConicalIcon },
  quiz: { label: "Квизы", icon: ListChecksIcon },
  faq: { label: "ЧаВо", icon: HelpCircleIcon },
  page: { label: "Страницы", icon: FileTextIcon },
  subject: { label: "Предметы", icon: BookOpenIcon },
};

const ORDER: SearchResult["kind"][] = [
  "note",
  "lab",
  "quiz",
  "subject",
  "faq",
  "page",
];

/**
 * Рисует сниппет из API: ts_headline отдаёт текст с `<mark>` вокруг совпадений.
 * Разбираем руками, а не через dangerouslySetInnerHTML, чтобы разметка из
 * конспекта не могла приехать в DOM как настоящий HTML.
 */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(<mark>|<\/mark>)/);
  const nodes: React.ReactNode[] = [];
  let marked = false;
  parts.forEach((part, i) => {
    if (part === "<mark>") {
      marked = true;
      return;
    }
    if (part === "</mark>") {
      marked = false;
      return;
    }
    if (!part) return;
    const key = `${i}-${part.slice(0, 12)}`;
    nodes.push(
      marked ? (
        <mark key={key} className="rounded bg-primary/15 text-foreground">
          {part}
        </mark>
      ) : (
        <span key={key}>{part}</span>
      ),
    );
  });
  return <span className="line-clamp-2">{nodes}</span>;
}

/** Поиск по сайту: кнопка в шапке плюс ⌘K / Ctrl+K. */
export function SearchDialog({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    // Дребезг: не дёргаем API на каждую букву.
    const timer = setTimeout(async () => {
      try {
        setResults(
          await apiClient<SearchResult[]>(
            `/search?q=${encodeURIComponent(q)}&limit=12`,
            { signal: ctrl.signal },
          ),
        );
      } catch {
        // Отменённый или упавший запрос просто не меняет выдачу.
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      setQuery("");
      router.push(path);
    },
    [router],
  );

  const groups = ORDER.map((kind) => ({
    kind,
    items: results.filter((r) => r.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Поиск по сайту"
        className={cn(
          "gap-2 text-muted-foreground sm:w-48 sm:justify-start",
          className,
        )}
      >
        <SearchIcon />
        <span className="hidden sm:inline">Поиск…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Поиск по сайту"
        description="Конспекты, лабы, квизы, ЧаВо и страницы"
        className="sm:max-w-xl"
      >
        {/* Фильтрует сервер, cmdk пусть показывает всё, что пришло. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Что ищем? Например «предел» или «лаба 3»"
          />
          <CommandList className="max-h-[60vh]">
            {query.trim().length < 2 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                Введите пару букв — ищем по конспектам, лабам, квизам, ЧаВо и
                страницам.
              </div>
            ) : loading && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Spinner className="size-4" /> Ищем…
              </div>
            ) : (
              <CommandEmpty>Ничего не нашлось. Попробуйте иначе.</CommandEmpty>
            )}
            {groups.map(({ kind, items }) => {
              const Icon = KIND[kind].icon;
              return (
                <CommandGroup key={kind} heading={KIND[kind].label}>
                  {items.map((r) => (
                    <CommandItem
                      key={`${r.kind}-${r.path}`}
                      value={r.path}
                      onSelect={() => go(r.path)}
                      className="items-start gap-2.5"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="block truncate font-medium">
                          {r.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {r.subtitle}
                        </span>
                        {r.snippet ? (
                          <span className="block text-xs text-muted-foreground">
                            <Snippet text={r.snippet} />
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
