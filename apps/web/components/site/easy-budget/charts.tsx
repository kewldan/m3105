"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {
  fmt,
  fmtGrade,
  HISTORY,
  PAIRS,
  pct,
  type Wave,
} from "@/lib/easy-budget/model";
import { cn } from "@/lib/utils";

/** Цвета графиков — токены сайта; «вы» — оранжевый из `--eb-you`. */
export const C = {
  primary: "var(--primary)",
  you: "var(--eb-you)",
  muted: "var(--muted-foreground)",
  good: "var(--success)",
  bad: "var(--destructive)",
  line: "var(--border)",
  bg: "var(--card)",
};

const LABEL = { fill: "var(--foreground)", fontWeight: 600 } as const;

type Tip = {
  text: string;
  x: number;
  y: number;
  flip: boolean;
  below: boolean;
};

/**
 * Область графика: меряет себя (SVG рисуется в пикселях, чтобы подписи не
 * масштабировались) и показывает подсказку над элементом с `data-tip`.
 */
export function ChartFrame({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: (w: number, h: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const hit = (e.target as Element).closest("[data-tip]");
    if (!el || !hit) {
      setTip(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setTip({
      text: hit.getAttribute("data-tip") ?? "",
      x,
      y,
      flip: x > r.width / 2,
      below: y < 70,
    });
  };

  return (
    <div
      ref={ref}
      className={cn("relative min-h-72", className)}
      onPointerMove={onMove}
      onPointerLeave={() => setTip(null)}
    >
      <svg
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full overflow-visible text-[12px] [&_text]:fill-muted-foreground [&_text]:stroke-card [&_text]:stroke-[4px] [&_text]:[paint-order:stroke] sm:text-[13px]"
      >
        {size.w > 0 && size.h > 0 ? children(size.w, size.h) : null}
      </svg>
      {tip ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-pre text-popover-foreground shadow-md tabular-nums"
          style={{
            left: tip.x,
            top: tip.y,
            transform: `translate(${tip.flip ? "calc(-100% - 12px)" : "12px"}, ${tip.below ? "16px" : "calc(-100% - 10px)"})`,
          }}
        >
          {tip.text}
        </div>
      ) : null}
    </div>
  );
}

export type Series = {
  p: number[];
  color: string;
  width: number;
  dashed?: boolean;
  name: string;
};

/** Кривые P(перевод | средний) с маркером «вы». */
export function curves(
  w: number,
  h: number,
  series: Series[],
  n: number,
  mark?: { p: number[]; gi: number },
) {
  const m = { l: 46, r: 18, t: 22, b: 36 };
  const x = (v: number) => m.l + (v - 4) * (w - m.l - m.r);
  const y = (v: number) => m.t + (1 - v) * (h - m.t - m.b);
  const step = w < 520 ? 2 : 1;
  const bw = (w - m.l - m.r) / n;
  const out: ReactNode[] = [];
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    out.push(
      <line
        key={`g${v}`}
        stroke={C.line}
        x1={m.l}
        x2={w - m.r}
        y1={y(v)}
        y2={y(v)}
      />,
      <text key={`gt${v}`} x={m.l - 8} y={y(v) + 4} textAnchor="end">
        {v * 100}%
      </text>,
    );
  }
  for (let i = 0; i <= 10; i += step)
    out.push(
      <text
        key={`x${i}`}
        x={x(4 + i / 10)}
        y={h - m.b + 22}
        textAnchor="middle"
      >
        {fmt(4 + i / 10)}
      </text>,
    );
  for (const se of series) {
    const d = se.p
      .map(
        (v, j) =>
          `${j ? "L" : "M"}${x(4 + j / n).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join("");
    out.push(
      <path
        key={`p${se.name}`}
        d={d}
        fill="none"
        stroke={se.color}
        strokeWidth={se.width}
        strokeDasharray={se.dashed ? "6 5" : undefined}
      />,
    );
    if (se.width > 2)
      for (let j = 0; j <= n; j++)
        out.push(
          <circle
            key={`c${se.name}${j}`}
            cx={x(4 + j / n)}
            cy={y(se.p[j])}
            r={3.5}
            fill={se.color}
          />,
        );
  }
  if (mark) {
    const g = 4 + mark.gi / n;
    const X = x(g);
    const v = mark.p[mark.gi];
    const Y = y(v);
    const right = X > w - 150;
    out.push(
      <line
        key="mv"
        x1={X}
        x2={X}
        y1={m.t}
        y2={h - m.b}
        stroke={C.you}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />,
      <circle
        key="mc"
        cx={X}
        cy={Y}
        r={7}
        fill={C.you}
        stroke={C.bg}
        strokeWidth={2}
      />,
      <text
        key="mt"
        x={right ? X - 12 : X + 12}
        y={Math.max(m.t + 12, Y - 12)}
        textAnchor={right ? "end" : "start"}
        style={LABEL}
      >
        {fmtGrade(g, n)} → {pct(v)}
      </text>,
    );
  }
  for (let j = 0; j <= n; j++)
    out.push(
      <rect
        key={`h${j}`}
        x={x(4 + j / n) - bw / 2}
        y={m.t}
        width={bw}
        height={h - m.t - m.b}
        fill="transparent"
        data-tip={`Средний ${fmtGrade(4 + j / n, n)}\n${series.map((se) => `${se.name}: ${pct(se.p[j])}`).join("\n")}`}
      />,
    );
  return out;
}

/** Столбики распределения, выделенный — оранжевый. */
export function bars(
  w: number,
  h: number,
  values: number[],
  labels: string[],
  highlight?: (i: number) => boolean,
) {
  const m = { l: 40, r: 8, t: 18, b: 30 };
  const mx = Math.max(...values) || 1;
  const bw = (w - m.l - m.r) / values.length;
  const y = (v: number) => m.t + (1 - v / mx) * (h - m.t - m.b);
  const every = Math.ceil(
    values.length / Math.max(4, Math.floor((w - m.l) / 46)),
  );
  const hi = highlight ? values.findIndex((_, q) => highlight(q)) : -1;
  const out: ReactNode[] = [];
  for (const f of [0, 0.5, 1])
    out.push(
      <line
        key={`g${f}`}
        stroke={C.line}
        x1={m.l}
        x2={w - m.r}
        y1={y(mx * f)}
        y2={y(mx * f)}
      />,
      <text key={`gt${f}`} x={m.l - 6} y={y(mx * f) + 4} textAnchor="end">
        {Math.round(mx * f * 100)}%
      </text>,
    );
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const X = m.l + i * bw;
    const on = highlight?.(i) ?? false;
    out.push(
      <rect
        key={`b${i}`}
        x={X + 1}
        y={y(v)}
        width={Math.max(1, bw - 2)}
        height={h - m.b - y(v)}
        rx={Math.min(3, bw / 4)}
        fill={on ? C.you : C.primary}
        data-tip={`${labels[i]}: ${pct(v)}`}
      />,
    );
    if (
      on ||
      (i % every === 0 &&
        (hi < 0 || Math.abs(i - hi) >= Math.max(2, every * 0.8)))
    )
      out.push(
        <text
          key={`l${i}`}
          x={X + bw / 2}
          y={h - m.b + 18}
          textAnchor="middle"
          style={on ? LABEL : undefined}
        >
          {labels[i]}
        </text>,
      );
  }
  return out;
}

const WAVE_COLOR: Record<Wave, string> = { s: C.primary, a: C.muted, w: C.you };
const WAVE_NAME: Record<Wave, string> = {
  s: "первая волна",
  a: "остаток в августе",
  w: "зимняя волна",
};

/** Вакантные места на 2-м курсе по датам опубликованных файлов. */
export function HistoryChart() {
  return (
    <ChartFrame label="Вакантные бюджетные места на 2-м курсе 09.03.02 по датам">
      {(w, h) => {
        const m = { l: 36, r: 24, t: 26, b: 34 };
        const t0 = Date.parse("2021-01-01");
        const t1 = Date.parse("2027-01-01");
        const x = (d: string) =>
          m.l + ((Date.parse(d) - t0) / (t1 - t0)) * (w - m.l - m.r);
        const y = (v: number) => m.t + (1 - v / 22) * (h - m.t - m.b);
        const out: ReactNode[] = [];
        for (const v of [0, 5, 10, 15, 20])
          out.push(
            <line
              key={`g${v}`}
              stroke={C.line}
              x1={m.l}
              x2={w - m.r}
              y1={y(v)}
              y2={y(v)}
            />,
            <text key={`gt${v}`} x={m.l - 6} y={y(v) + 4} textAnchor="end">
              {v}
            </text>,
          );
        for (let yr = 2021; yr <= 2026; yr++)
          if (w >= 520 || yr % 2 === 1)
            out.push(
              <text
                key={`y${yr}`}
                x={x(`${yr}-07-01`)}
                y={h - m.b + 22}
                textAnchor="middle"
              >
                {yr}
              </text>,
            );
        out.push(
          <rect
            key="gap"
            x={x("2022-01-01")}
            y={m.t}
            width={x("2023-01-01") - x("2022-01-01")}
            height={h - m.t - m.b}
            fill={C.line}
            opacity={0.45}
          />,
          <text
            key="gapt"
            x={(x("2022-01-01") + x("2023-01-01")) / 2}
            y={m.t + 14}
            textAnchor="middle"
          >
            нет данных
          </text>,
        );
        for (const [yr, a, b, d1, d2] of PAIRS)
          out.push(
            <line
              key={`pair${yr}`}
              x1={x(d1)}
              y1={y(a)}
              x2={x(d2)}
              y2={y(b)}
              stroke={C.muted}
              strokeDasharray="2 3"
            />,
          );
        for (const [d, v, k] of HISTORY) {
          const X = x(d);
          const Y = y(v);
          out.push(
            <circle
              key={`c${d}`}
              cx={X}
              cy={Y}
              r={k === "s" ? 8 : 6}
              fill={WAVE_COLOR[k]}
              stroke={C.bg}
              strokeWidth={2}
              data-tip={`${d.split("-").reverse().join(".")}: ${v} мест (${WAVE_NAME[k]})`}
            />,
          );
          if (k === "s" || w >= 520)
            out.push(
              <text
                key={`t${d}`}
                x={X}
                y={Y - 13}
                textAnchor="middle"
                style={LABEL}
              >
                {v}
              </text>,
            );
        }
        return out;
      }}
    </ChartFrame>
  );
}

/** Линия легенды: сплошная или пунктир. */
export function LegendLine({
  color,
  dashed,
  thick,
  children,
}: {
  color: string;
  dashed?: boolean;
  thick?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i
        aria-hidden
        className="inline-block w-5"
        style={{
          borderTop: `${thick ? 10 : 3}px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      {children}
    </span>
  );
}

export function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
      {children}
    </div>
  );
}

/** Ползунок с подписью и текущим значением. */
export function RangeField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  accent,
  hint,
}: {
  label: ReactNode;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm font-medium">
        <span id={id}>{label}</span>
        <output
          className="shrink-0 font-semibold tabular-nums"
          style={{ color: accent ? C.you : C.primary }}
        >
          {display}
        </output>
      </div>
      <SliderPrimitive.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        thumbAlignment="edge"
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      >
        <SliderPrimitive.Control className="relative flex h-6 w-full touch-none items-center select-none">
          <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted select-none">
            <SliderPrimitive.Indicator
              className="h-full select-none"
              style={{ background: accent ? C.you : C.primary }}
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-labelledby={id}
            getAriaValueText={() => display}
            className="relative block size-4 shrink-0 rounded-full border-2 bg-background shadow-sm ring-ring/50 transition-[box-shadow] select-none after:absolute after:-inset-3 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3"
            style={{ borderColor: accent ? C.you : C.primary }}
          />
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
