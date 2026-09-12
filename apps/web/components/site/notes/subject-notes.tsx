"use client";

import {
  ChevronRightIcon,
  KeyboardIcon,
  SearchIcon,
  SearchXIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EmptyState } from "@/components/site/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Note, SubjectWithCounts } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

import { monthLabel, shortDate } from "./last-note";

const PAGE = 40;

type Mode = "number" | "month";

/** Wraps the matched fragment in <mark>. */
function Highlight({
  text,
  query,
}: {
  text: string;
  query: string;
}): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/15 text-inherit">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * Dense, searchable, paginated list of a subject's lectures.
 * Keyboard: `/` focuses search, ↑/↓ move between rows, Enter opens.
 */
export function SubjectNotes({
  subject,
  notes,
}: {
  subject: SubjectWithCounts;
  notes: Note[];
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("number");
  const [limit, setLimit] = useState(PAGE);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const c = subjectColor(subject.color);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const sorted = [...notes].sort(
      (a, b) => a.number - b.number || a.title.localeCompare(b.title, "ru"),
    );
    if (!q) return sorted;
    return sorted.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        String(n.number) === q ||
        `лекция ${n.number}` === q,
    );
  }, [notes, q]);

  const visible = filtered.slice(0, limit);
  const hasMore = filtered.length > visible.length;

  const groups = useMemo(() => {
    if (mode === "number") return [{ key: "all", label: "", notes: visible }];
    const map = new Map<string, Note[]>();
    for (const n of visible) {
      const key = n.lectureDate ? n.lectureDate.slice(0, 7) : "";
      const list = map.get(key) ?? [];
      list.push(n);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : b.localeCompare(a)))
      .map(([key, list]) => ({
        key: key || "none",
        label: monthLabel(key ? `${key}-01` : null),
        notes: list,
      }));
  }, [visible, mode]);

  // `/` focuses the search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (
        e.key === "/" &&
        !isEditable(e.target) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const focusRow = useCallback((idx: number) => {
    const rows = rowRefs.current.filter(Boolean) as HTMLAnchorElement[];
    if (rows.length === 0) return;
    const clamped = Math.max(0, Math.min(idx, rows.length - 1));
    rows[clamped]?.focus();
    rows[clamped]?.scrollIntoView({ block: "nearest" });
  }, []);

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const idx = Number(target.dataset.index ?? "-1");
    if (Number.isNaN(idx) || idx < 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(idx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx === 0) searchRef.current?.focus();
      else focusRow(idx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusRow(Number.MAX_SAFE_INTEGER);
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(0);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else searchRef.current?.blur();
    } else if (e.key === "Enter" && filtered.length === 1) {
      rowRefs.current[0]?.click();
    }
  };

  const total = notes.length;
  let rowIndex = -1;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-10 -mx-1 space-y-2 bg-background/95 px-1 pt-1 pb-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:top-16">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Название, тема или номер лекции…"
              className="h-9 pr-16 pl-8"
              aria-label="Поиск по лекциям предмета"
            />
            <div className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="pointer-events-auto rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Очистить поиск"
                >
                  <XIcon className="size-3.5" />
                </button>
              ) : (
                <Kbd className="hidden sm:inline-flex">/</Kbd>
              )}
            </div>
          </div>
          <ToggleGroup
            value={[mode]}
            onValueChange={(v) => {
              const next = (v as Mode[])[0];
              if (next) setMode(next);
            }}
            variant="outline"
            size="sm"
            aria-label="Группировка"
            className="shrink-0"
          >
            <ToggleGroupItem
              value="number"
              className="data-pressed:bg-primary/10 data-pressed:text-primary"
            >
              По номеру
            </ToggleGroupItem>
            <ToggleGroupItem
              value="month"
              className="data-pressed:bg-primary/10 data-pressed:text-primary"
            >
              По месяцу
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span aria-live="polite">
            {q
              ? `Найдено ${filtered.length} из ${total}`
              : `${total} ${plural(total, "лекция", "лекции", "лекций")}`}
            {hasMore ? ` · показано ${visible.length}` : ""}
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <KeyboardIcon className="size-3.5" aria-hidden />
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> по списку, <Kbd>Enter</Kbd> открыть
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          title="Ничего не нашлось"
          description="Попробуйте другое слово или номер лекции."
          action={
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Сбросить поиск
            </Button>
          }
        />
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: keyboard roving over the link rows inside.
        <div className="space-y-6" onKeyDown={onListKeyDown}>
          {groups.map((g) => (
            <section
              key={g.key}
              className="space-y-2"
              aria-label={g.label || undefined}
            >
              {g.label ? (
                <h3 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.label}
                </h3>
              ) : null}
              <ul className="divide-y rounded-xl border bg-card">
                {g.notes.map((n) => {
                  rowIndex += 1;
                  const i = rowIndex;
                  return (
                    <li key={n.id}>
                      <Link
                        ref={(el) => {
                          rowRefs.current[i] = el;
                        }}
                        data-index={i}
                        tabIndex={i === 0 ? 0 : -1}
                        href={`/notes/${n.subjectSlug}/${n.slug}`}
                        className="group flex items-center gap-3 px-3 py-2.5 transition-colors outline-none hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-4"
                      >
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                            c.badge,
                          )}
                        >
                          {n.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium group-hover:text-primary">
                              <Highlight text={n.title} query={q} />
                            </span>
                            {n.quizzesCount > 0 ? (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                title="К лекции есть квиз"
                              >
                                <SparklesIcon className="size-3" aria-hidden />
                                квиз
                              </span>
                            ) : null}
                          </div>
                          {n.summary ? (
                            <div className="truncate text-xs text-muted-foreground">
                              <Highlight text={n.summary} query={q} />
                            </div>
                          ) : null}
                          {n.lectureDate ? (
                            <div className="text-[11px] text-muted-foreground tabular-nums sm:hidden">
                              {shortDate(n.lectureDate)}
                            </div>
                          ) : null}
                        </div>
                        {n.lectureDate ? (
                          <span className="hidden w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                            {shortDate(n.lectureDate)}
                          </span>
                        ) : null}
                        <ChevronRightIcon
                          className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {hasMore ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setLimit((l) => l + PAGE)}
              >
                Показать ещё {Math.min(PAGE, filtered.length - visible.length)}{" "}
                из {filtered.length - visible.length}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
