"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

const R = 54;
const C = 2 * Math.PI * R;

/** Animated circular score indicator (0–100). */
export function ScoreRing({
  percent,
  size = 160,
  className,
}: {
  percent: number;
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? percent : 0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const dash = useTransform(mv, (v) => C * (1 - v / 100));

  useEffect(() => {
    if (reduce) {
      mv.set(percent);
      return;
    }
    const ctrl = animate(mv, percent, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => ctrl.stop();
  }, [percent, mv, reduce]);

  const tone =
    percent >= 90
      ? "text-emerald-500"
      : percent >= 70
        ? "text-primary"
        : percent >= 50
          ? "text-amber-500"
          : "text-rose-500";

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 128 128" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <motion.circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          style={{ strokeDashoffset: dash }}
          className={cn("stroke-current", tone)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn("font-heading text-4xl font-bold tabular-nums", tone)}
        >
          <motion.span>{rounded}</motion.span>
          <span className="text-xl">%</span>
        </div>
      </div>
    </div>
  );
}
