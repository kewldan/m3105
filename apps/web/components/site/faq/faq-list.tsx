"use client";

import { HelpCircleIcon, LinkIcon, SearchIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/site/empty-state";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FaqEntry = {
  id: number;
  question: string;
  category: string;
  /** Plain text used for client-side search (question + raw answer). */
  searchText: string;
  answer: ReactNode;
};

const ALL = "__all__";

function hashId(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/^#(faq-\d+)$/);
  return m ? m[1] : null;
}

export function FaqList({ items }: { items: FaqEntry[] }) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [open, setOpen] = useState<string[]>([]);

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const it of items)
      if (it.category) seen.set(it.category, (seen.get(it.category) ?? 0) + 1);
    return [...seen.entries()];
  }, [items]);

  // Open and scroll to the item referenced by the URL hash (/faq#faq-12).
  useEffect(() => {
    const apply = () => {
      const id = hashId();
      if (!id) return;
      setQuery("");
      setCategory(ALL);
      setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
      requestAnimationFrame(() => {
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (category !== ALL && it.category !== category) return false;
      if (!q) return true;
      return it.searchText.toLowerCase().includes(q);
    });
  }, [items, query, category]);

  const copyLink = async (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например: как сдать лабу, где взять методичку…"
            className="h-11 pl-9 text-base"
            aria-label="Поиск по вопросам"
          />
        </div>
        {categories.length > 0 ? (
          <fieldset className="min-w-0">
            <legend className="sr-only">Категории</legend>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-0.5">
              <Chip active={category === ALL} onClick={() => setCategory(ALL)}>
                Все{" "}
                <span className="opacity-70 tabular-nums">{items.length}</span>
              </Chip>
              {categories.map(([name, count]) => (
                <Chip
                  key={name}
                  active={category === name}
                  onClick={() => setCategory(category === name ? ALL : name)}
                >
                  {name}{" "}
                  <span className="opacity-70 tabular-nums">{count}</span>
                </Chip>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={HelpCircleIcon}
          title={items.length === 0 ? "Вопросов пока нет" : "Ничего не нашлось"}
          description={
            items.length === 0
              ? "Раздел наполняется. Загляните позже."
              : "Попробуйте другой запрос или снимите фильтр."
          }
        />
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={`${category}:${query}`}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Accordion
              value={open}
              onValueChange={(v) => setOpen(v as string[])}
              className="rounded-2xl border bg-card px-4 sm:px-5"
            >
              {filtered.map((it) => {
                const id = `faq-${it.id}`;
                return (
                  <AccordionItem
                    key={it.id}
                    value={id}
                    id={id}
                    className="scroll-mt-24"
                  >
                    <AccordionTrigger className="gap-3 py-3.5 text-base hover:no-underline sm:py-4">
                      <span className="min-w-0 flex-1 text-left text-pretty">
                        {it.question}
                        {category === ALL && it.category ? (
                          <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                            {it.category}
                          </span>
                        ) : null}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 text-base">
                      <div className="prose dark:prose-invert max-w-none [&_p]:my-2">
                        {it.answer}
                      </div>
                      <button
                        type="button"
                        onClick={() => copyLink(id)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <LinkIcon className="size-3" />
                        Скопировать ссылку на вопрос
                      </button>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      {children}
    </button>
  );
}
