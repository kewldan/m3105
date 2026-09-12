"use client";

import { StarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const LABELS = ["Ужас", "Так себе", "Норм", "Хорошо", "Огонь"];
const STARS = [1, 2, 3, 4, 5];

/** Five stars: read-only display or an interactive picker when `onChange` is given. */
export function RatingStars({
  value,
  onChange,
  size = "sm",
  className,
}: {
  value: number | null;
  onChange?: (value: number) => void;
  size?: "sm" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? "size-6" : "size-4";
  const star = (n: number) => (
    <StarIcon
      className={cn(
        px,
        value != null && n <= value
          ? "fill-amber-400 text-amber-400"
          : "text-muted-foreground/40",
        onChange && "transition-transform group-hover/star:scale-110",
      )}
      aria-hidden
    />
  );
  if (!onChange) {
    return (
      <span
        role="img"
        aria-label={`Оценка ${value ?? 0} из 5`}
        className={cn("inline-flex items-center gap-0.5", className)}
      >
        {STARS.map((n) => (
          <span key={n}>{star(n)}</span>
        ))}
      </span>
    );
  }
  return (
    <fieldset className={cn("inline-flex items-center gap-0.5", className)}>
      <legend className="sr-only">Оценка</legend>
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value != null && n <= value}
          aria-label={`${n} — ${LABELS[n - 1]}`}
          title={LABELS[n - 1]}
          onClick={() => onChange(n)}
          className="group/star rounded-md p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {star(n)}
        </button>
      ))}
    </fieldset>
  );
}
