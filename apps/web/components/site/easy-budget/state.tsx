"use client";

import {
  createContext,
  type ReactNode,
  use,
  useDeferredValue,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type Computed,
  computeAll,
  type Params,
  SCENARIOS,
  type ScenarioKey,
  type SimResult,
  simulate,
} from "@/lib/easy-budget/model";

type Selection = {
  /** Экзаменов и дифзачётов за год. */
  n: number;
  /** Пятёрок из n: средний 4 + gi/n. */
  gi: number;
};

type Lab = { params: Params; preset: ScenarioKey | null };

type BudgetState = {
  /** Положение ползунков — меняется сразу. */
  input: Selection;
  /** То, по чему посчитаны результаты (отстаёт на время пересчёта). */
  n: number;
  gi: number;
  grade: number;
  computed: Computed | null;
  lab: Lab;
  labResult: SimResult | null;
  setGi: (gi: number) => void;
  setN: (n: number) => void;
  setLabParam: (key: keyof Params, value: number) => void;
  setPreset: (preset: ScenarioKey) => void;
};

const BudgetContext = createContext<BudgetState | null>(null);

const noop = () => () => {};

/**
 * Состояние страницы: средний балл, число оценок и сценарий лаборатории.
 * Монте-Карло идёт только в браузере (на сервере — прочерки): так не нужно
 * совпадать до бита с серверными Math.log/cos, и HTML отдаётся сразу.
 */
export function BudgetProvider({ children }: { children: ReactNode }) {
  const [input, setInput] = useState<Selection>({ n: 10, gi: 5 });
  const [lab, setLab] = useState<Lab>({
    params: SCENARIOS.base,
    preset: "base",
  });
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  // Ползунок двигается сразу, а пересчёт (десятки миллисекунд) — следом.
  const sel = useDeferredValue(input);
  const labParams = useDeferredValue(lab.params);

  const computed = useMemo(
    () => (mounted ? computeAll(sel.n) : null),
    [mounted, sel.n],
  );
  const labResult = useMemo(
    () => (mounted ? simulate(labParams, sel.n, 3000, 5) : null),
    [mounted, labParams, sel.n],
  );

  const value: BudgetState = {
    input,
    n: sel.n,
    gi: sel.gi,
    grade: 4 + sel.gi / sel.n,
    computed,
    lab,
    labResult,
    setGi: (gi) => setInput((s) => ({ ...s, gi })),
    setN: (n) => setInput((s) => ({ n, gi: Math.round((s.gi / s.n) * n) })),
    setLabParam: (key, v) =>
      setLab((l) => ({ params: { ...l.params, [key]: v }, preset: null })),
    setPreset: (preset) => setLab({ params: { ...SCENARIOS[preset] }, preset }),
  };

  return <BudgetContext value={value}>{children}</BudgetContext>;
}

export function useBudget(): BudgetState {
  const ctx = use(BudgetContext);
  if (!ctx) throw new Error("useBudget вне BudgetProvider");
  return ctx;
}
