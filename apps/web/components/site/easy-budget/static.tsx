import katex from "katex";
import type { CSSProperties, ReactNode } from "react";

import { DIRECTION_YEARS, DIRECTIONS, PAIRS } from "@/lib/easy-budget/model";
import { cn } from "@/lib/utils";

/** Формула KaTeX, отрендеренная на сервере: клиенту не нужен сам KaTeX. */
export function Tex({
  children,
  display,
}: {
  children: string;
  display?: boolean;
}) {
  const html = katex.renderToString(children, {
    displayMode: Boolean(display),
    throwOnError: false,
    output: "htmlAndMathml",
    strict: "ignore",
  });
  return display ? (
    <div
      className="overflow-x-auto overflow-y-hidden py-2 text-[1.05em]"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX из формул, записанных в коде страницы.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <span
      // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX из формул, записанных в коде страницы.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const YOU = "var(--eb-you)";

/** Июль → август: сколько мест заняли в первой волне. */
export function Dumbbells() {
  return (
    <div className="space-y-3">
      {PAIRS.map(([year, july, august]) => (
        <div
          key={year}
          className="grid grid-cols-[3.4em_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[4em_minmax(0,1fr)_10.5em]"
        >
          <b className="tabular-nums">{year}</b>
          <div className="relative h-6 border-b">
            <div
              className="absolute top-2.5 h-1 bg-primary"
              style={{
                left: `${(august / 20) * 100}%`,
                width: `${((july - august) / 20) * 100}%`,
              }}
            />
            <div
              className="absolute top-1 -ml-2 size-4 rounded-full border-2 border-card bg-primary"
              style={{ left: `${(july / 20) * 100}%` }}
            />
            <div
              className="absolute top-1 -ml-2 size-4 rounded-full border-2 border-card bg-muted-foreground"
              style={{ left: `${(august / 20) * 100}%` }}
            />
          </div>
          <span className="col-start-2 text-muted-foreground tabular-nums sm:col-start-auto">
            {july} → {august}: заняли ≥{july - august}
          </span>
        </div>
      ))}
    </div>
  );
}

const KCP: [number, string, string][] = [
  [132, "общие", "var(--primary)"],
  [18, "особая", "color-mix(in oklch, var(--primary) 70%, var(--card))"],
  [18, "отдельная", "color-mix(in oklch, var(--primary) 50%, var(--card))"],
  [7, "целевые", "color-mix(in oklch, var(--primary) 30%, var(--card))"],
];

/** Откуда 175 бюджетных мест. */
export function KcpStack() {
  return (
    <div className="space-y-2">
      <div className="flex h-11 overflow-hidden rounded-lg">
        {KCP.map(([v, name, color], i) => (
          <div
            key={name}
            className={cn(
              "flex items-center justify-center overflow-hidden text-sm font-semibold whitespace-nowrap tabular-nums",
              i < 2 ? "text-primary-foreground" : "text-foreground",
            )}
            style={{ flex: v, background: color }}
            title={`${name}: ${v}`}
          >
            {v}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
        {KCP.map(([v, name, color]) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <i
              aria-hidden
              className="inline-block size-3 rounded-sm"
              style={{ background: color }}
            />
            {name} {v}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 132 общих места против 152 олимпиадников. */
export function OlympBars() {
  const rows: [string, number, CSSProperties][] = [
    ["Места", 132, { background: "var(--primary)" }],
    ["Олимпиадники", 152, { background: YOU }],
  ];
  return (
    <div className="grid gap-1.5">
      {rows.map(([name, v, style]) => (
        <div
          key={name}
          className="grid grid-cols-[7em_minmax(0,1fr)_3em] items-center gap-2.5 text-sm"
        >
          <span>{name}</span>
          <div className="relative h-4 overflow-hidden rounded-sm bg-muted">
            <i
              className="absolute inset-y-0 left-0"
              style={{ ...style, width: `${(v / 152) * 100}%` }}
            />
          </div>
          <span className="text-right tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Места на 2-м курсе по соседним направлениям, июль. */
export function Directions() {
  return (
    <div className="grid grid-cols-[5.2em_repeat(4,minmax(0,1fr))] items-end gap-x-2.5 gap-y-1.5 text-xs sm:grid-cols-[7em_repeat(4,minmax(0,1fr))] sm:text-sm">
      <span />
      {DIRECTION_YEARS.map((y) => (
        <span key={y} className="text-center text-xs text-muted-foreground">
          {y}
        </span>
      ))}
      {DIRECTIONS.map(([name, values, mine]) => (
        <div key={name} className="contents">
          <span
            className={cn("self-center", mine && "font-semibold")}
            style={mine ? { color: YOU } : undefined}
          >
            {name}
          </span>
          {values.map((v, i) =>
            v == null ? (
              <div
                key={DIRECTION_YEARS[i]}
                className="h-24 rounded-sm"
                title="нет данных"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, var(--muted) 0 6px, transparent 6px 12px)",
                }}
              />
            ) : (
              <div
                key={DIRECTION_YEARS[i]}
                className="flex h-24 flex-col justify-end overflow-hidden rounded-sm bg-muted"
              >
                <span className="text-center leading-5 font-semibold tabular-nums">
                  {v}
                </span>
                <i
                  className="block"
                  style={{
                    height: `${(v / 20) * 72}px`,
                    background: mine ? YOU : "var(--primary)",
                  }}
                />
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/** Блок модели с акцентной полосой слева. */
export function Rule({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-l-[3px] border-primary pl-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </div>
  );
}
