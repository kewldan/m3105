"use client";

import { CheckIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { loginHref } from "@/components/site/user-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Round check button used for the personal "сдано" mark. */
export function DoneToggle({
  checked,
  onToggle,
  disabled = false,
  size = "md",
  label = "Отметить как сданную",
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  /** Guests cannot mark labs; the toggle links to sign-in instead. */
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const sizeCls = size === "sm" ? "size-6" : "size-8";

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={loginHref(pathname)}
              aria-label="Войдите, чтобы отмечать сданные лабы"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 bg-card text-transparent transition-colors outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                sizeCls,
                className,
              )}
            />
          }
        >
          <CheckIcon
            className={size === "sm" ? "size-3.5" : "size-4"}
            strokeWidth={3}
            aria-hidden
          />
        </TooltipTrigger>
        <TooltipContent>Войдите, чтобы отмечать сданные</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={checked ? "Снять отметку о сдаче" : label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        sizeCls,
        checked
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-muted-foreground/40 bg-card text-transparent hover:border-emerald-500/70",
        className,
      )}
    >
      <motion.span
        initial={false}
        animate={
          checked
            ? { scale: 1, opacity: 1 }
            : { scale: reduce ? 1 : 0.4, opacity: 0 }
        }
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="flex"
      >
        <CheckIcon
          className={size === "sm" ? "size-3.5" : "size-4"}
          strokeWidth={3}
          aria-hidden
        />
      </motion.span>
    </button>
  );
}
