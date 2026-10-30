import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const TONE = {
  amber: "bg-amber-500/12 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  blue: "bg-blue-500/12 text-blue-700 ring-blue-500/30 dark:text-blue-300",
  violet:
    "bg-violet-500/12 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  emerald:
    "bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  cyan: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/30 dark:text-cyan-300",
  pink: "bg-pink-500/12 text-pink-700 ring-pink-500/30 dark:text-pink-300",
  rose: "bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  slate: "bg-slate-500/12 text-slate-700 ring-slate-500/30 dark:text-slate-300",
};

type Tone = keyof typeof TONE;

/** <Badge tone="amber">Яндекс</Badge> */
export function Badge({
  tone = "slate",
  children,
}: {
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone] ?? TONE.slate,
      )}
    >
      {children}
    </span>
  );
}

// Цвет шкалы — по доле от максимума: зелёный для простого, красный для сложного.
const LEVEL = [
  {
    upTo: 0.3,
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  { upTo: 0.5, bar: "bg-lime-500", text: "text-lime-600 dark:text-lime-400" },
  {
    upTo: 0.6,
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  {
    upTo: 0.7,
    bar: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
  },
  { upTo: 1, bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" },
];

/** <Level value="2.5" /> — шкала из делений (по умолчанию пять), можно с половиной. */
export function Level({ value, max = "5" }: { value: string; max?: string }) {
  const v = Number(value.replace(",", "."));
  const m = Number(max) || 5;
  const tone = LEVEL.find((l) => v / m <= l.upTo) ?? LEVEL[LEVEL.length - 1];
  const label = String(v).replace(".", ",");
  return (
    <span
      className="inline-flex items-center gap-2"
      role="img"
      aria-label={`Сложность ${label} из ${m}`}
    >
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: m }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: деления шкалы не переставляются.
            key={i}
            className="h-1.5 w-4 overflow-hidden rounded-full bg-foreground/10"
          >
            <span
              className={cn("block h-full", tone.bar)}
              style={{ width: `${Math.min(Math.max(v - i, 0), 1) * 100}%` }}
            />
          </span>
        ))}
      </span>
      <span className={cn("text-xs font-semibold tabular-nums", tone.text)}>
        {label}
        <span className="font-normal text-muted-foreground">/{m}</span>
      </span>
    </span>
  );
}

/** <Tags items="Go, Postgres, Docker" /> — короткие метки через запятую. */
export function Tags({ items }: { items: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {items
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (
          <span
            key={t}
            className="rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            {t}
          </span>
        ))}
    </span>
  );
}

/** <Meta>…</Meta> — строка из Badge, Level и Tags под заголовком. */
export function Meta({ children }: { children?: ReactNode }) {
  return (
    <div className="not-prose my-4 flex flex-wrap items-center gap-x-3 gap-y-2 [&_p]:contents">
      {children}
    </div>
  );
}

/** <Cards><Card …/>…</Cards> — сетка карточек-ссылок. */
export function Cards({ children }: { children?: ReactNode }) {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 [&_p]:contents">
      {children}
    </div>
  );
}

/**
 * <Card href="#…" title="…" n="1" badge="Яндекс" tone="amber" level="1" />
 * Без href — просто карточка (например, вариант стека с tags="a, b").
 */
export function Card({
  href,
  title,
  n,
  badge,
  tone,
  level,
  tags,
  children,
}: {
  href?: string;
  title: string;
  n?: string;
  badge?: string;
  tone?: Tone;
  level?: string;
  tags?: string;
  children?: ReactNode;
}) {
  const heading = (
    <span
      className={cn(
        "font-medium leading-snug",
        href && "group-hover:text-primary",
      )}
    >
      {title}
    </span>
  );
  const body = (
    <>
      {n ? (
        <>
          <span className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              №{n}
            </span>
            {badge && <Badge tone={tone}>{badge}</Badge>}
          </span>
          {heading}
        </>
      ) : (
        <span className="flex items-start justify-between gap-2">
          {heading}
          {badge && <Badge tone={tone}>{badge}</Badge>}
        </span>
      )}
      {children && (
        <span className="text-sm text-muted-foreground">{children}</span>
      )}
      {(tags || level) && (
        <span className="mt-auto flex flex-col gap-2 pt-1">
          {tags && <Tags items={tags} />}
          {level && <Level value={level} />}
        </span>
      )}
    </>
  );
  const className = "group flex flex-col gap-2 rounded-xl border bg-card p-4";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <a
      href={href}
      className={cn(
        className,
        "transition-colors hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      {body}
    </a>
  );
}
