"use client";

import {
  ArrowRightIcon,
  ListTreeIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SubjectIcon } from "@/components/site/subject-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import type { Note, SubjectColor } from "@/lib/api/types";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEARCH_THRESHOLD = 15;

type Props = {
  notes: Note[];
  currentId: number;
  subject: {
    slug: string;
    name: string;
    color: SubjectColor | "";
    icon: string;
  };
  variant?: "aside" | "inline";
  className?: string;
};

function OutlineList({
  notes,
  currentId,
  query,
  layoutId,
  onNavigate,
  className,
  visible = true,
}: {
  notes: Note[];
  currentId: number;
  query: string;
  layoutId: string;
  onNavigate?: () => void;
  className?: string;
  /** Re-centres the current lecture when the list becomes visible (collapsible). */
  visible?: boolean;
}) {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the current lecture in view inside the scrollable rail. The
  // collapsible animates its height after opening, so we re-centre on every
  // resize for a short while instead of once.
  useEffect(() => {
    if (!visible) return;
    const list = listRef.current;
    if (!list) return;
    const center = () => {
      if (list.clientHeight === 0) return;
      const el = list.querySelector<HTMLElement>('[aria-current="page"]');
      if (!el) return;
      const listRect = list.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const target =
        elRect.top -
        listRect.top +
        list.scrollTop -
        list.clientHeight / 2 +
        elRect.height / 2;
      list.scrollTop = Math.max(0, target);
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(list);
    const stop = window.setTimeout(() => observer.disconnect(), 800);
    return () => {
      window.clearTimeout(stop);
      observer.disconnect();
    };
  }, [visible]);

  const q = query.trim().toLowerCase();
  const items = q
    ? notes.filter(
        (n) => n.title.toLowerCase().includes(q) || String(n.number) === q,
      )
    : notes;

  if (items.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-muted-foreground">
        Ничего не нашлось
      </p>
    );
  }
  return (
    <ul
      ref={listRef}
      className={cn(
        "relative space-y-px overflow-y-auto border-l text-sm",
        className,
      )}
    >
      {items.map((n) => {
        const isCurrent = n.id === currentId;
        return (
          <li key={n.id} className="relative">
            {isCurrent ? (
              <motion.span
                layoutId={reduce ? undefined : layoutId}
                className="absolute top-0 -left-px h-full w-0.5 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <Link
              href={`/notes/${n.subjectSlug}/${n.slug}`}
              aria-current={isCurrent ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-baseline gap-2 py-1 pr-2 pl-3 transition-colors hover:text-foreground",
                isCurrent
                  ? "font-medium text-primary"
                  : "text-muted-foreground",
              )}
            >
              <span className="w-6 shrink-0 text-right text-xs tabular-nums">
                {n.number}
              </span>
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
              {n.quizzesCount > 0 ? (
                <SparklesIcon
                  className="size-3 shrink-0 self-center text-primary/70"
                  aria-label="Есть квиз"
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ordered list of all lectures of the subject with the current one highlighted.
 * `aside` is a sticky rail (xl+), `inline` is a collapsible for narrower screens.
 */
export function CourseOutline({
  notes,
  currentId,
  subject,
  variant = "aside",
  className,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...notes].sort((a, b) => a.number - b.number),
    [notes],
  );
  const position = sorted.findIndex((n) => n.id === currentId);
  const showSearch = sorted.length > SEARCH_THRESHOLD;
  const countLabel = `${sorted.length} ${plural(sorted.length, "лекция", "лекции", "лекций")}`;

  const search = showSearch ? (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Найти лекцию…"
        className="h-8 pl-7 text-sm"
        aria-label="Поиск по лекциям курса"
      />
    </div>
  ) : null;

  if (variant === "inline") {
    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("rounded-xl border bg-card", className)}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium">
          <SubjectIcon icon={subject.icon} color={subject.color} size="sm" />
          <span className="min-w-0 flex-1 truncate text-left">
            Лекции курса
            <span className="ml-1.5 font-normal text-muted-foreground">
              {position >= 0
                ? `${position + 1} из ${sorted.length}`
                : countLabel}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {open ? "Скрыть" : "Показать"}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 px-4 pb-3">
          {search}
          <OutlineList
            notes={sorted}
            currentId={currentId}
            query={query}
            layoutId="outline-inline"
            onNavigate={() => setOpen(false)}
            className="max-h-72"
            visible={open}
          />
          <Link
            href={`/notes?subject=${encodeURIComponent(subject.slug)}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Все конспекты предмета
            <ArrowRightIcon className="size-3" aria-hidden />
          </Link>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <nav aria-label="Содержание курса" className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <SubjectIcon icon={subject.icon} color={subject.color} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <ListTreeIcon className="size-3.5" aria-hidden />
            Лекции курса
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {position >= 0 ? `${position + 1} из ${sorted.length}` : countLabel}
          </div>
        </div>
      </div>
      {search}
      <OutlineList
        notes={sorted}
        currentId={currentId}
        query={query}
        layoutId="outline-aside"
        className="max-h-[calc(100vh-16rem)]"
      />
      <Link
        href={`/notes?subject=${encodeURIComponent(subject.slug)}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Все конспекты предмета
        <ArrowRightIcon className="size-3" aria-hidden />
      </Link>
    </nav>
  );
}
