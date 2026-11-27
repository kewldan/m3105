import { LETTER_TONE, LETTERS, letterFor, passed } from "@/lib/grades";
import { cn } from "@/lib/utils";

/**
 * ITMO grade for a total: the letter with the five-point grade beside it
 * («D3»), the word in the tooltip. Below E it
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
  const l = LETTERS.find((x) => x.letter === letter);
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold",
        LETTER_TONE[letter],
        className,
      )}
      title={l ? `${letter} / ${l.grade} — ${l.label}` : letter}
    >
      {letter}
      {l ? <span className="ml-px opacity-60">{l.grade}</span> : null}
    </span>
  );
}
