"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";

/** Thin progress bar fixed to the top of the viewport that tracks page scroll. */
export function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const reduce = useReducedMotion();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    mass: 0.4,
  });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX: reduce ? scrollYProgress : scaleX }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-primary"
    />
  );
}
