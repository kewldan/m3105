"use client";

import { ListIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { TocItem } from "@/lib/mdx/render";
import { cn } from "@/lib/utils";

const HEADER_OFFSET = 96;

function useScrollSpy(items: TocItem[]) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const pick = () => {
      let current: string | null = headings[0].id;
      for (const el of headings) {
        if (el.getBoundingClientRect().top - HEADER_OFFSET <= 0)
          current = el.id;
        else break;
      }
      // At the very bottom, highlight the last heading.
      if (
        window.innerHeight + window.scrollY >=
        document.body.scrollHeight - 2
      ) {
        current = headings[headings.length - 1].id;
      }
      setActive(current);
    };

    const observer = new IntersectionObserver(pick, {
      rootMargin: `-${HEADER_OFFSET}px 0px -60% 0px`,
      threshold: [0, 1],
    });
    for (const el of headings) observer.observe(el);
    window.addEventListener("scroll", pick, { passive: true });
    pick();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
    };
  }, [items]);

  return active;
}

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  window.history.replaceState(null, "", `#${id}`);
}

/** Nearest ancestor that scrolls vertically (the sticky rail on note pages). */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
  }
  return null;
}

/**
 * Keeps the active link visible inside the scrollable rail as the reader
 * moves through the page: the list scrolls with the article, the window
 * itself is never touched.
 */
function useFollowActive(
  listRef: React.RefObject<HTMLUListElement | null>,
  active: string | null,
  enabled: boolean,
) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!enabled || !active) return;
    const list = listRef.current;
    const box = scrollParent(list);
    if (!list || !box) return;
    const link = list.querySelector<HTMLElement>(
      `a[href="#${CSS.escape(active)}"]`,
    );
    if (!link) return;
    const pad = 56;
    const boxRect = box.getBoundingClientRect();
    const rect = link.getBoundingClientRect();
    let delta = 0;
    if (rect.top < boxRect.top + pad) delta = rect.top - boxRect.top - pad;
    else if (rect.bottom > boxRect.bottom - pad)
      delta = rect.bottom - boxRect.bottom + pad;
    if (delta !== 0)
      box.scrollBy({ top: delta, behavior: reduce ? "auto" : "smooth" });
  }, [active, enabled, listRef, reduce]);
}

function TocLinks({
  items,
  active,
  onNavigate,
  layoutId,
  followActive = false,
}: {
  items: TocItem[];
  active: string | null;
  onNavigate?: () => void;
  layoutId: string;
  followActive?: boolean;
}) {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  useFollowActive(listRef, active, followActive);
  return (
    <ul ref={listRef} className="relative space-y-0.5 border-l text-sm">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <li key={item.id} className="relative">
            {isActive ? (
              <motion.span
                layoutId={reduce ? undefined : layoutId}
                className="absolute top-0 -left-px h-full w-0.5 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
              />
            ) : null}
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollTo(item.id);
                onNavigate?.();
              }}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "block truncate py-1 transition-colors hover:text-foreground",
                item.depth === 3 ? "pl-7" : "pl-4",
                isActive ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              {item.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Table of contents with scroll-spy. `variant="aside"` is a sticky side rail
 * (lg+), `variant="inline"` is a collapsible block for small screens.
 */
export function Toc({
  items,
  variant = "aside",
  className,
  title = "Содержание",
}: {
  items: TocItem[];
  variant?: "aside" | "inline";
  className?: string;
  title?: string;
}) {
  const active = useScrollSpy(items);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (items.length === 0) return null;

  if (variant === "inline") {
    return (
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("rounded-xl border bg-card", className)}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium">
          <ListIcon className="size-4 text-muted-foreground" />
          {title}
          <span className="ml-auto text-xs text-muted-foreground">
            {open ? "Скрыть" : "Показать"}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-3">
          <TocLinks
            items={items}
            active={active}
            onNavigate={close}
            layoutId="toc-inline"
          />
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <nav aria-label={title} className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <ListIcon className="size-3.5" />
        {title}
      </div>
      <TocLinks
        items={items}
        active={active}
        layoutId="toc-aside"
        followActive
      />
    </nav>
  );
}
