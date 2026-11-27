"use client";

import type { ReactNode } from "react";

import {
  bars,
  C,
  ChartFrame,
  curves,
  Legend,
  LegendLine,
  RangeField,
} from "@/components/site/easy-budget/charts";
import { Panel } from "@/components/site/easy-budget/panel";
import { useBudget } from "@/components/site/easy-budget/state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  betaBinomialPmf,
  fmt,
  fmtGrade,
  HEAT_RIVALS,
  HEAT_SEATS,
  histogram,
  LAB_SLIDERS,
  median,
  medianThreshold,
  pct,
  SCENARIO_KEYS,
  SCENARIO_NAMES,
  thresholdGrid,
  WEIGHTS,
} from "@/lib/easy-budget/model";

const DASH = "—";

/** Заголовок страницы с текущим средним и шансом. */
export function Headline() {
  const { n, gi, grade, computed } = useBudget();
  return (
    <>
      Средний{" "}
      <span className="text-primary tabular-nums">{fmtGrade(grade, n)}</span>{" "}
      без троек даёт около{" "}
      <span className="tabular-nums" style={{ color: C.you }}>
        {computed ? pct(computed.mix[gi]) : DASH}
      </span>{" "}
      шансов перейти на бюджет 09.03.02 летом 2027
    </>
  );
}

function Figure({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="font-heading text-3xl font-bold tracking-tight whitespace-nowrap tabular-nums sm:text-4xl">
        {value}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export function HeroFigures() {
  const { n, computed } = useBudget();
  const base = computed?.runs.base;
  const threshold = base ? medianThreshold(base.T, n) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Figure value="18–20" label="мест на 2-й курс в июле 2023–2026" />
      <Figure
        value={base ? median(base.K) : DASH}
        label="мест к лету 2027, медиана базы"
      />
      <Figure
        value={base ? median(base.N) : DASH}
        label="допущенных конкурентов, медиана базы"
      />
      <Figure
        value={threshold != null ? fmt(threshold, 1) : DASH}
        label="проходной средний, медиана базы"
      />
    </div>
  );
}

/** Главный график и панель «ваш средний». */
export function ChanceSection({ gradeFormula }: { gradeFormula: ReactNode }) {
  const { input, n, gi, grade, computed, setGi, setN } = useBudget();
  const inputGrade = 4 + input.gi / input.n;
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <h2 className="text-xl font-semibold text-balance sm:text-2xl">
          Вероятность перевода от среднего за две сессии
        </h2>
        <Legend>
          <LegendLine color={C.primary}>смесь сценариев 25/50/25</LegendLine>
          <LegendLine color={C.good} dashed>
            оптимистичный
          </LegendLine>
          <LegendLine color={C.muted} dashed>
            базовый
          </LegendLine>
          <LegendLine color={C.bad} dashed>
            пессимистичный
          </LegendLine>
        </Legend>
        <Panel className="p-3 sm:p-4">
          <ChartFrame
            label="Вероятность перевода в зависимости от среднего балла"
            className="min-h-80 sm:min-h-[26rem]"
          >
            {(w, h) =>
              computed
                ? curves(
                    w,
                    h,
                    [
                      {
                        p: computed.runs.opt.p,
                        color: C.good,
                        width: 1.6,
                        dashed: true,
                        name: "Опт.",
                      },
                      {
                        p: computed.runs.base.p,
                        color: C.muted,
                        width: 1.6,
                        dashed: true,
                        name: "База",
                      },
                      {
                        p: computed.runs.pes.p,
                        color: C.bad,
                        width: 1.6,
                        dashed: true,
                        name: "Песс.",
                      },
                      {
                        p: computed.mix,
                        color: C.primary,
                        width: 3.5,
                        name: "Смесь",
                      },
                    ],
                    n,
                    { p: computed.mix, gi },
                  )
                : null
            }
          </ChartFrame>
        </Panel>
        <p className="text-sm text-muted-foreground">
          Только оценки «хорошо» и «отлично», без единой задолженности. Одна
          «тройка» или долг на момент подачи — вероятность 0: к конкурсу не
          допускают.
        </p>
      </div>
      <Panel className="space-y-5 lg:sticky lg:top-32">
        <div>
          <div className="text-sm text-muted-foreground">
            Ваш средний за 1-й курс
          </div>
          <div
            className="font-heading text-6xl font-bold tracking-tight tabular-nums sm:text-7xl"
            style={{ color: C.you }}
          >
            {computed ? pct(computed.mix[gi]) : DASH}
          </div>
          <div className="text-sm text-muted-foreground">
            шанс перевода при среднем {fmtGrade(grade, n)}
          </div>
        </div>
        <RangeField
          label="Средний балл"
          value={input.gi}
          display={fmtGrade(inputGrade, input.n)}
          min={0}
          max={input.n}
          step={1}
          onChange={setGi}
          accent
        />
        <RangeField
          label="Экзаменов и дифзачётов за год"
          value={input.n}
          display={String(input.n)}
          min={6}
          max={14}
          step={1}
          onChange={setN}
          hint="У ИСиТ 5 оценочных предметов в семестр — 10 за год. Зачёты (2, на ТОП-потоках 3) в средний не входят, но несданный зачёт — это долг."
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Сценарий</TableHead>
              <TableHead className="text-right">Вес</TableHead>
              <TableHead className="text-right">Шанс</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SCENARIO_KEYS.map((s) => (
              <TableRow key={s}>
                <TableCell>{SCENARIO_NAMES[s]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {WEIGHTS[s] * 100}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {computed ? pct(computed.runs[s].p[gi]) : DASH}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Смесь</TableCell>
              <TableCell className="text-right tabular-nums">100%</TableCell>
              <TableCell
                className="text-right font-semibold tabular-nums"
                style={{ color: C.you }}
              >
                {computed ? pct(computed.mix[gi]) : DASH}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">{gradeFormula}</p>
      </Panel>
    </div>
  );
}

/** Лаборатория: свой сценарий и распределения k, N, g*, G. */
export function LabSection({
  tex,
}: {
  tex: { k: ReactNode; N: ReactNode; gStar: ReactNode; pmf: ReactNode };
}) {
  const { n, gi, grade, computed, lab, labResult, setLabParam, setPreset } =
    useBudget();
  const r = labResult;
  const kLo = r ? Math.min(...r.K) : 0;
  const kHi = r ? Math.max(...r.K) : 0;
  const nLo = r ? Math.min(...r.N) : 0;
  const nHi = r ? Math.max(...r.N) : 0;
  const range = (lo: number, hi: number) =>
    Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));

  const small = (
    title: ReactNode,
    label: string,
    draw: (w: number, h: number) => ReactNode,
    caption?: string,
  ) => (
    <Panel className="space-y-2">
      <h3 className="text-base font-semibold">{title}</h3>
      <ChartFrame label={label} className="min-h-56">
        {(w, h) => (r ? draw(w, h) : null)}
      </ChartFrame>
      {caption ? (
        <p className="text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </Panel>
  );

  return (
    <div className="space-y-5">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Пресеты сценария</legend>
        {SCENARIO_KEYS.map((s) => (
          <Button
            key={s}
            variant={lab.preset === s ? "default" : "outline"}
            aria-pressed={lab.preset === s}
            onClick={() => setPreset(s)}
          >
            {SCENARIO_NAMES[s]}
          </Button>
        ))}
      </fieldset>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Panel className="space-y-3">
          <Legend>
            <LegendLine color={C.you}>ваш сценарий</LegendLine>
            <LegendLine color={C.primary} dashed>
              смесь
            </LegendLine>
          </Legend>
          <ChartFrame label="Вероятность перевода по вашему сценарию">
            {(w, h) =>
              computed && r
                ? curves(
                    w,
                    h,
                    [
                      {
                        p: computed.mix,
                        color: C.primary,
                        width: 1.8,
                        dashed: true,
                        name: "Смесь",
                      },
                      {
                        p: r.p,
                        color: C.you,
                        width: 3.5,
                        name: "Ваш сценарий",
                      },
                    ],
                    n,
                    { p: r.p, gi },
                  )
                : null
            }
          </ChartFrame>
          <p className="text-sm text-muted-foreground">
            При вашем среднем{" "}
            <b className="text-foreground">{fmtGrade(grade, n)}</b>:{" "}
            <b style={{ color: C.you }}>{r ? pct(r.p[gi]) : DASH}</b>
          </p>
        </Panel>
        <Panel className="space-y-5">
          {LAB_SLIDERS.map((s) => (
            <RangeField
              key={s.key}
              label={s.label}
              value={lab.params[s.key]}
              display={s.format(lab.params[s.key])}
              min={s.min}
              max={s.max}
              step={s.step}
              onChange={(v) => setLabParam(s.key, v)}
            />
          ))}
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {small(
          <>Сколько мест: распределение {tex.k}</>,
          "Распределение числа мест",
          (w, h) => {
            if (!r) return null;
            const km = median(r.K);
            return bars(
              w,
              h,
              histogram(r.K, kLo, kHi),
              range(kLo, kHi),
              (i) => kLo + i === km,
            );
          },
        )}
        {small(
          <>Сколько допущенных: распределение {tex.N}</>,
          "Распределение числа допущенных",
          (w, h) => {
            if (!r) return null;
            const nm = median(r.N);
            return bars(
              w,
              h,
              histogram(r.N, nLo, nHi),
              range(nLo, nHi),
              (i) => nLo + i === nm,
            );
          },
        )}
        {small(
          <>Проходной средний {tex.gStar}</>,
          "Распределение проходного среднего",
          (w, h) =>
            r
              ? bars(
                  w,
                  h,
                  r.T,
                  r.T.map((_, j) =>
                    j > n ? "нет мест" : fmtGrade(4 + j / n, n),
                  ),
                  (j) => j === gi,
                )
              : null,
          "«4,0» — допущенных не больше мест, переводят всех.",
        )}
        {small(
          <>Средние у допущенных: {tex.pmf}</>,
          "Распределение средних у допущенных",
          (w, h) =>
            bars(
              w,
              h,
              betaBinomialPmf(n, lab.params.rv),
              Array.from({ length: n + 1 }, (_, j) => fmt(4 + j / n, 1)),
              (j) => j === gi,
            ),
        )}
      </div>
    </div>
  );
}

/** Торнадо: что сильнее всего двигает шанс. */
export function Tornado() {
  const { n, gi, grade, computed } = useBudget();
  const base = computed ? computed.tornadoBase[gi] : 0;
  const rows = computed
    ? computed.tornado
        .map((t) => ({ name: t.name, a: t.low[gi], z: t.high[gi] }))
        .sort((p, q) => Math.abs(q.z - q.a) - Math.abs(p.z - p.a))
    : [];
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-balance sm:text-2xl">
        Что сильнее всего двигает ваш шанс
      </h2>
      <p className="text-muted-foreground">
        Базовый сценарий при вашем среднем{" "}
        <b className="text-foreground">{fmtGrade(grade, n)}</b>, каждое
        допущение отдельно сдвинуто к пессимистичному и оптимистичному краю.
        Вертикальная черта — база.
      </p>
      <div className="grid grid-cols-[minmax(0,7.5em)_minmax(0,1fr)_6em] items-center gap-x-3 gap-y-2 text-sm sm:grid-cols-[minmax(0,10.5em)_minmax(0,1fr)_6.6em]">
        {rows.map((r) => {
          const lo = Math.min(r.a, r.z);
          const hi = Math.max(r.a, r.z);
          return (
            <div key={r.name} className="contents">
              <span>{r.name}</span>
              <div
                className="relative h-6 rounded-sm bg-muted"
                title={`${pct(r.a)} … ${pct(r.z)}`}
              >
                <i
                  className="absolute inset-y-0 rounded-sm bg-primary/85"
                  style={{
                    left: `${lo * 100}%`,
                    width: `${Math.max(0.5, (hi - lo) * 100)}%`,
                  }}
                />
                <b
                  className="absolute -inset-y-1 w-0.5 bg-foreground"
                  style={{ left: `${base * 100}%` }}
                />
              </div>
              <span className="text-right whitespace-nowrap tabular-nums">
                {pct(r.a)} → {pct(r.z)}
              </span>
            </div>
          );
        })}
        <span />
        <span className="text-xs text-muted-foreground">
          шкала 0–100%, база {computed ? pct(base) : DASH}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          песс. → опт.
        </span>
      </div>
    </div>
  );
}

/** Проходной средний по числу мест и конкурентов. */
export function Heatmap() {
  const { n } = useBudget();
  const grid = thresholdGrid(n);
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[26rem] gap-0.5 text-xs tabular-nums"
        style={{
          gridTemplateColumns: `3em repeat(${HEAT_SEATS.length}, minmax(2.1em, 1fr))`,
        }}
      >
        <div className="flex min-h-8 items-center justify-center text-muted-foreground">
          N \ k
        </div>
        {HEAT_SEATS.map((k) => (
          <div
            key={k}
            className="flex min-h-8 items-center justify-center text-muted-foreground"
          >
            {k}
          </div>
        ))}
        {HEAT_RIVALS.map((N, row) => (
          <div key={N} className="contents">
            <div className="flex min-h-8 items-center justify-center text-muted-foreground">
              {N}
            </div>
            {HEAT_SEATS.map((k, col) => {
              const v = grid[row][col];
              const likely = k >= 14 && k <= 22 && N >= 15 && N <= 35;
              return (
                <div
                  key={k}
                  className="flex min-h-8 items-center justify-center rounded-[3px]"
                  title={`k=${k}, N=${N}: ≈${fmt(v, 2)}`}
                  style={{
                    background: `color-mix(in oklch, var(--primary) ${Math.round((v - 4) * 100)}%, var(--card))`,
                    color: v > 4.55 ? "var(--primary-foreground)" : undefined,
                    outline: likely ? `2px solid ${C.you}` : undefined,
                    outlineOffset: likely ? -2 : undefined,
                  }}
                >
                  {fmt(v, 1)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Сколько четвёрок можно получить. */
export function Ladder() {
  const { n, gi, computed } = useBudget();
  const rows = Array.from({ length: n + 1 }, (_, f) => n - f);
  const you = { color: C.you, fontWeight: 700 };
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-balance sm:text-2xl">
        Сколько четвёрок можно получить за год
      </h2>
      <p className="text-muted-foreground">
        При <b className="text-foreground">{n}</b> экзаменах и дифзачётах за две
        сессии. Шанс — по смеси сценариев. Тройка обнуляет всё.
      </p>
      <div className="grid grid-cols-[5.5em_4.6em_minmax(0,1fr)_3.4em] items-center gap-x-3 gap-y-1.5 text-sm tabular-nums">
        <span className="text-xs text-muted-foreground">Четвёрок</span>
        <span className="text-xs text-muted-foreground">Средний</span>
        <span className="text-xs text-muted-foreground">Шанс</span>
        <span />
        {rows.map((j) => {
          const me = j === gi;
          const v = computed ? computed.mix[j] : 0;
          return (
            <div key={j} className="contents">
              <span style={me ? you : undefined}>{n - j}</span>
              <span style={me ? you : undefined}>{fmtGrade(4 + j / n, n)}</span>
              <div className="relative h-4 overflow-hidden rounded-sm bg-muted">
                <i
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${v * 100}%`,
                    background: me ? C.you : C.primary,
                  }}
                />
              </div>
              <span className="text-right" style={me ? you : undefined}>
                {computed ? pct(v) : DASH}
              </span>
            </div>
          );
        })}
        <span>+ тройка</span>
        <span>{DASH}</span>
        <div className="h-4 rounded-sm bg-muted" />
        <span className="text-right">0%</span>
      </div>
    </div>
  );
}
