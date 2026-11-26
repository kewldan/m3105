import { LETTER_TONE, LETTERS, letterFor, passed } from "@/lib/grades";
import { cn } from "@/lib/utils";

/**
 * ITMO letter grade for a total, with the word in the tooltip. Below E it
 * keeps its place empty: mid-term almost everyone is there, an «F» on every
 * row only adds noise. A pass-fail subject shows «зачёт» from 60% instead.
 */
export function LetterChip({
  total,
  max,
  passFail = false,
  className,
}: {
  total: number;
  max: number;
  passFail?: boolean;
  className?: string;
}) {
  if (passFail) {
    if (!passed(total, max)) {
      return <span className={cn("h-6 min-w-6", className)} aria-hidden />;
    }
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center justify-center rounded-md px-1.5 text-xs font-bold",
          LETTER_TONE.A,
          className,
        )}
        title="Зачёт: 60% баллов и больше"
      >
        зачёт
      </span>
    );
  }
  const letter = letterFor(total, max);
  if (letter === "F") {
    return <span className={cn("h-6 min-w-6", className)} aria-hidden />;
  }
  const label =
    LETTERS.find((l) => l.letter === letter)?.label ?? "пока не зачёт";
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold",
        LETTER_TONE[letter],
        className,
      )}
      title={`${letter} — ${label}`}
    >
      {letter}
    </span>
  );
}
