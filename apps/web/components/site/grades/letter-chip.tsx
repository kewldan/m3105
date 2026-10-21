import { LETTER_TONE, LETTERS, letterFor } from "@/lib/grades";
import { cn } from "@/lib/utils";

/**
 * ITMO letter grade for a total, with the word in the tooltip. Below E it
 * keeps its place empty: mid-term almost everyone is there, an «F» on every
 * row only adds noise.
 */
export function LetterChip({
  total,
  max,
  className,
}: {
  total: number;
  max: number;
  className?: string;
}) {
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
