/**
 * Модель перевода с контракта на бюджет 09.03.02 (страница /p/easy-budget):
 * данные о вакансиях, сценарии и Монте-Карло. Без React — считается в браузере.
 */

export type Params = {
  /** Бюджетников на курсе: набор 2026 по приказам о зачислении. */
  B: number;
  /** Отсев бюджетников за 1-й курс: среднее и разброс. */
  dMu: number;
  dSd: number;
  /** Места, ушедшие не платникам (целевики, СВО, переводы). */
  lamL: number;
  /** Добавка к августовской волне. */
  lamA: number;
  /** Контрактников на курсе: набор 2026 по приказам о зачислении. */
  Mc: number;
  /** Доля допущенных к конкурсу и её концентрация. */
  peMu: number;
  peK: number;
  /** Средний балл у допущенных. */
  rv: number;
};

export type ScenarioKey = "opt" | "base" | "pes";
export const SCENARIO_KEYS: ScenarioKey[] = ["opt", "base", "pes"];

const BASE: Params = {
  B: 188,
  dMu: 0.105,
  dSd: 0.015,
  lamL: 0.7,
  lamA: 1,
  Mc: 328,
  peMu: 0.06,
  peK: 40,
  rv: 4.48,
};

export const SCENARIOS: Record<ScenarioKey, Params> = {
  opt: { ...BASE, dMu: 0.125, lamL: 0.2, peMu: 0.045 },
  base: { ...BASE },
  pes: { ...BASE, dMu: 0.09, lamL: 2, peMu: 0.085 },
};

export const WEIGHTS: Record<ScenarioKey, number> = {
  opt: 0.25,
  base: 0.5,
  pes: 0.25,
};

export const SCENARIO_NAMES: Record<ScenarioKey, string> = {
  opt: "Оптимистичный",
  base: "Базовый",
  pes: "Пессимистичный",
};

// ---------- форматирование ----------

export const fmt = (x: number, digits = 1) =>
  x.toFixed(digits).replace(".", ",");
export const pct = (p: number) => `${Math.round(p * 100)}%`;
/** Средний балл: один знак, если он «круглый», иначе два. */
export const fmtGrade = (x: number, n: number) =>
  fmt(x, Number.isInteger((Math.round((x - 4) * n) * 10) / n) ? 1 : 2);

export type LabSlider = {
  key: keyof Params;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
};

export const LAB_SLIDERS: LabSlider[] = [
  {
    key: "dMu",
    label: "Отсев бюджетников за 1-й курс, μ_d",
    min: 0.06,
    max: 0.14,
    step: 0.002,
    format: (v) => `${fmt(v * 100)}%`,
  },
  {
    key: "lamL",
    label: "Места не платникам, λ_L",
    min: 0,
    max: 4,
    step: 0.1,
    format: (v) => fmt(v),
  },
  {
    key: "lamA",
    label: "Добавка к августу, λ_A",
    min: 0,
    max: 3,
    step: 0.1,
    format: (v) => fmt(v),
  },
  {
    key: "Mc",
    label: "Контрактная когорта, M_c",
    min: 250,
    max: 400,
    step: 5,
    format: (v) => String(v),
  },
  {
    key: "peMu",
    label: "Доля допущенных, μ_e",
    min: 0.02,
    max: 0.14,
    step: 0.005,
    format: (v) => `${fmt(v * 100)}%`,
  },
  {
    key: "rv",
    label: "Средний у допущенных",
    min: 4.3,
    max: 4.7,
    step: 0.01,
    format: (v) => fmt(v, 2),
  },
];

export const PARAM_ROWS: [string, keyof Params, (v: number) => string][] = [
  ["μ_d, отсев", "dMu", (v) => `${fmt(v * 100)}%`],
  ["λ_L, утечка мест", "lamL", (v) => fmt(v)],
  ["λ_A, август", "lamA", (v) => fmt(v)],
  ["M_c, когорта", "Mc", (v) => String(v)],
  ["μ_e, допущенные", "peMu", (v) => `${fmt(v * 100)}%`],
  ["средний допущенных", "rv", (v) => fmt(v, 2)],
];

// ---------- данные ----------

export type Wave = "s" | "a" | "w";
/** Вакантные места на 2-м курсе 09.03.02 по опубликованным файлам. */
export const HISTORY: [date: string, seats: number, wave: Wave][] = [
  ["2021-06-01", 2, "s"],
  ["2023-07-03", 20, "s"],
  ["2024-01-29", 6, "w"],
  ["2024-07-04", 20, "s"],
  ["2024-08-15", 0, "a"],
  ["2025-06-27", 19, "s"],
  ["2025-08-18", 8, "a"],
  ["2026-01-20", 3, "w"],
  ["2026-07-01", 18, "s"],
  ["2026-08-18", 1, "a"],
];

/** Июль → август: [год, июль, август, дата июля, дата августа]. */
export const PAIRS: [number, number, number, string, string][] = [
  [2024, 20, 0, "2024-07-04", "2024-08-15"],
  [2025, 19, 8, "2025-06-27", "2025-08-18"],
  [2026, 18, 1, "2026-07-01", "2026-08-18"],
];

/** Соседние направления, 2-й курс, июль 2023–2026; null — нет данных. */
export const DIRECTIONS: [string, (number | null)[], boolean][] = [
  ["09.03.02 ИСиТ", [20, 20, 19, 18], true],
  ["09.03.04 ПИ", [5, 7, null, 18], false],
  ["01.03.02 ПМИ", [9, 15, 2, 10], false],
  ["10.03.01 ИБ", [8, 5, null, 2], false],
  ["09.03.01 ИВТ", [2, 5, 1, 1], false],
];
export const DIRECTION_YEARS = [2023, 2024, 2025, 2026];

export type Cohort = {
  year: number;
  /** Зачислено на бюджет без вступительных испытаний. */
  bvi: number;
  /** Квоты: отдельная, особая (null — приказа нет в архиве), целевая. */
  separate: number;
  special: number | null;
  target: number;
  /** Бюджетников всего; approx — особая квота оценена. */
  budget: number;
  budgetApprox?: boolean;
  /** Контрактников (граждане РФ); partial — в архиве не все приказы. */
  contract: number;
  contractPartial?: boolean;
  /** Вакантных мест на 2-м курсе в июле следующего года. */
  july: number | null;
};

/**
 * Наборы 09.03.02 по приказам о зачислении: 2026 — abit.itmo.ru,
 * 2023–2025 — снимки веб-архива. По ЕГЭ на бюджет не зачисляли никого,
 * основа у всех — «бюджет» или «контракт», группы «за счёт ИТМО» нет.
 */
export const COHORTS: Cohort[] = [
  {
    year: 2023,
    bvi: 131,
    separate: 13,
    special: null,
    target: 9,
    budget: 160,
    budgetApprox: true,
    contract: 242,
    contractPartial: true,
    july: 20,
  },
  {
    year: 2024,
    bvi: 129,
    separate: 10,
    special: 6,
    target: 21,
    budget: 166,
    contract: 301,
    contractPartial: true,
    july: 19,
  },
  {
    year: 2025,
    bvi: 161,
    separate: 16,
    special: 13,
    target: 7,
    budget: 197,
    contract: 289,
    july: 18,
  },
  {
    year: 2026,
    bvi: 145,
    separate: 21,
    special: 18,
    target: 4,
    budget: 188,
    contract: 328,
    july: null,
  },
];

// ---------- генераторы ----------

type Rng = () => number;

/** mulberry32: воспроизводимые прогоны при одном зерне. */
function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(r: Rng): number {
  let u = 0;
  while (!u) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Marsaglia–Tsang. */
function gamma(r: Rng, shape: number): number {
  if (shape < 1) return gamma(r, shape + 1) * r() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (
      u < 1 - 0.0331 * x ** 4 ||
      Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))
    )
      return d * v;
  }
}

function beta(r: Rng, a: number, b: number): number {
  const x = gamma(r, a);
  return x / (x + gamma(r, b));
}

function poisson(r: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > limit);
  return k - 1;
}

function binomial(r: Rng, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k++;
  return k;
}

/** Параметры бета-распределения «доли пятёрок» при среднем `m`. */
const betaParams = (m: number): [number, number] => {
  const a = 4.2 * (m - 4);
  return [a, 4.2 - a];
};

export type SimResult = {
  /** p[j] — шанс перевода при среднем 4 + j/n. */
  p: number[];
  /** Места k и допущенные N по прогонам. */
  K: number[];
  N: number[];
  /** T[j] — доля прогонов с проходным 4 + j/n; T[n+1] — мест нет. */
  T: number[];
};

export function simulate(
  P: Params,
  n: number,
  runs: number,
  seed: number,
): SimResult {
  const r = rng(seed);
  const [a, b] = betaParams(P.rv);
  const pr = new Float64Array(n + 1);
  const K: number[] = [];
  const NN: number[] = [];
  const T = new Array<number>(n + 2).fill(0);
  for (let s = 0; s < runs; s++) {
    const d = Math.min(0.3, Math.max(0.02, P.dMu + P.dSd * normal(r)));
    const k = Math.max(
      0,
      Math.round(P.B * d) - poisson(r, P.lamL) + poisson(r, P.lamA),
    );
    const M = P.Mc - 25 + Math.floor(r() * 51);
    const pe = beta(r, P.peMu * P.peK, (1 - P.peMu) * P.peK);
    const N = binomial(r, M, pe);
    const c = new Array<number>(n + 1).fill(0);
    for (let i = 0; i < N; i++) c[binomial(r, n, beta(r, a, b))]++;
    let above = 0;
    for (let j = n; j >= 0; j--) {
      pr[j] += Math.min(1, Math.max(0, (k - above) / (c[j] + 1)));
      above += c[j];
    }
    let t = 0;
    if (N <= k) t = 0;
    else if (k === 0) t = n + 1;
    else {
      let cum = 0;
      for (let j = n; j >= 0; j--) {
        cum += c[j];
        if (cum >= k) {
          t = j;
          break;
        }
      }
    }
    T[t]++;
    K.push(k);
    NN.push(N);
  }
  return {
    p: Array.from(pr, (v) => v / runs),
    K,
    N: NN,
    T: T.map((v) => v / runs),
  };
}

/** Бета-биномиальное распределение среднего: Pr(G = 4 + j/n). */
export function betaBinomialPmf(n: number, mean: number): number[] {
  const [a, b] = betaParams(mean);
  const p: number[] = [];
  let v = 1;
  for (let i = 0; i < n; i++) v *= (b + i) / (a + b + i);
  p.push(v);
  for (let j = 0; j < n; j++) {
    v *= (((n - j) / (j + 1)) * (a + j)) / (b + n - j - 1);
    p.push(v);
  }
  return p;
}

export const median = (values: number[]) => {
  const s = [...values].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** Доли значений по корзинам lo…hi. */
export function histogram(values: number[], lo: number, hi: number): number[] {
  const c = new Array<number>(hi - lo + 1).fill(0);
  for (const v of values) c[Math.min(hi, Math.max(lo, v)) - lo]++;
  return c.map((v) => v / values.length);
}

// ---------- сценарии и чувствительность ----------

export type TornadoRow = {
  name: string;
  /** Шансы при пессимистичном и оптимистичном крае допущения. */
  low: number[];
  high: number[];
};

export type Computed = {
  runs: Record<ScenarioKey, SimResult>;
  mix: number[];
  tornado: TornadoRow[];
  tornadoBase: number[];
};

const TORNADO: [string, keyof Params, number, number][] = [
  ["Отсев бюджетников", "dMu", 0.09, 0.125],
  ["Места не платникам", "lamL", 2.5, 0],
  ["Добавка к августу", "lamA", 0, 2.5],
  ["Контрактная когорта", "Mc", 360, 300],
  ["Доля допущенных", "peMu", 0.085, 0.04],
  ["Сила конкурентов", "rv", 4.6, 4.35],
];

export function mixture(runs: Record<ScenarioKey, SimResult>): number[] {
  return runs.base.p.map(
    (_, j) =>
      WEIGHTS.opt * runs.opt.p[j] +
      WEIGHTS.base * runs.base.p[j] +
      WEIGHTS.pes * runs.pes.p[j],
  );
}

/** Три сценария на 4 000 прогонов и торнадо на 2 000 — при каждом n. */
export function computeAll(n: number): Computed {
  const runs = {
    opt: simulate(SCENARIOS.opt, n, 4000, 11),
    base: simulate(SCENARIOS.base, n, 4000, 11),
    pes: simulate(SCENARIOS.pes, n, 4000, 11),
  };
  const tornado = TORNADO.map(([name, key, lo, hi]) => ({
    name,
    low: simulate({ ...SCENARIOS.base, [key]: lo }, n, 2000, 7).p,
    high: simulate({ ...SCENARIOS.base, [key]: hi }, n, 2000, 7).p,
  }));
  return {
    runs,
    mix: mixture(runs),
    tornado,
    tornadoBase: simulate(SCENARIOS.base, n, 2000, 7).p,
  };
}

/** Медианный проходной средний; null — мест нет. */
export function medianThreshold(T: number[], n: number): number | null {
  let c = 0;
  for (let j = 0; j < T.length; j++) {
    c += T[j];
    if (c >= 0.5) return j > n ? null : 4 + j / n;
  }
  return null;
}

export const HEAT_SEATS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26];
export const HEAT_RIVALS = [10, 15, 20, 25, 30, 35, 40, 45, 50];

/** Проходной g* ≈ Q_G(1 − k/N) при базовом распределении средних. */
export function thresholdGrid(n: number): number[][] {
  const pmf = betaBinomialPmf(n, SCENARIOS.base.rv);
  const cdf: number[] = [];
  pmf.reduce((acc, v, i) => {
    cdf[i] = acc + v;
    return cdf[i];
  }, 0);
  const th = (k: number, N: number) => {
    if (N <= k) return 4;
    const q = 1 - k / N;
    for (let j = 0; j <= n; j++) if (cdf[j] >= q) return 4 + j / n;
    return 5;
  };
  return HEAT_RIVALS.map((N) => HEAT_SEATS.map((k) => th(k, N)));
}
