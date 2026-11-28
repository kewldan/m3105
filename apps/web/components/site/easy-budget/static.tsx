import katex from "katex";
import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COHORTS,
  DIRECTION_YEARS,
  DIRECTIONS,
  PAIRS,
} from "@/lib/easy-budget/model";
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
  [145, "олимпиадники (БВИ)", "var(--primary)"],
  [
    21,
    "отдельная квота",
    "color-mix(in oklch, var(--primary) 70%, var(--card))",
  ],
  [18, "особая квота", "color-mix(in oklch, var(--primary) 50%, var(--card))"],
  [4, "целевая квота", "color-mix(in oklch, var(--primary) 30%, var(--card))"],
];

/** Из кого состоят 188 бюджетников набора 2026. */
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

export const CONTRACT =
  "color-mix(in oklch, var(--muted-foreground) 35%, var(--card))";

/** Бюджет и контракт по наборам: кто будет конкурировать за вакансии. */
export function CohortBars() {
  const max = Math.max(...COHORTS.map((c) => c.budget + c.contract));
  return (
    <div className="grid gap-2">
      {COHORTS.map((c) => (
        <div
          key={c.year}
          className="grid grid-cols-[3em_minmax(0,1fr)] items-center gap-3 text-sm"
        >
          <b className="tabular-nums">{c.year}</b>
          <div
            className="flex h-6 overflow-hidden rounded-sm text-xs font-semibold tabular-nums"
            style={{ width: `${((c.budget + c.contract) / max) * 100}%` }}
          >
            <div
              className="flex items-center justify-center bg-primary text-primary-foreground"
              style={{ flex: c.budget }}
              title={`бюджет: ${c.budget}`}
            >
              {c.budgetApprox ? "≈" : ""}
              {c.budget}
            </div>
            <div
              className="flex items-center justify-center text-foreground"
              style={{ flex: c.contract, background: CONTRACT }}
              title={`контракт: ${c.contract}`}
            >
              {c.contractPartial ? "≥" : ""}
              {c.contract}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Наборы 09.03.02 по приказам о зачислении и места на 2-м курсе через год. */
export function CohortTable() {
  const pctOf = (k: number, b: number) =>
    `${((k / b) * 100).toFixed(1).replace(".", ",")}%`;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Набор</TableHead>
          <TableHead className="text-right">БВИ</TableHead>
          <TableHead className="text-right">
            Квоты: отд. / особ. / цел.
          </TableHead>
          <TableHead className="text-right">По ЕГЭ</TableHead>
          <TableHead className="text-right">Бюджет</TableHead>
          <TableHead className="text-right">Контракт</TableHead>
          <TableHead className="text-right">Мест в июле</TableHead>
          <TableHead className="text-right">Отсев</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {COHORTS.map((c) => (
          <TableRow key={c.year}>
            <TableCell className="font-semibold">{c.year}</TableCell>
            <TableCell className="text-right">{c.bvi}</TableCell>
            <TableCell className="text-right">
              {c.separate} / {c.special ?? "—"} / {c.target}
            </TableCell>
            <TableCell className="text-right">0</TableCell>
            <TableCell className="text-right">
              {c.budgetApprox ? "≈" : ""}
              {c.budget}
            </TableCell>
            <TableCell className="text-right">
              {c.contractPartial ? "≥" : ""}
              {c.contract}
            </TableCell>
            <TableCell className="text-right">{c.july ?? "—"}</TableCell>
            <TableCell className="text-right">
              {c.july != null ? pctOf(c.july, c.budget) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
