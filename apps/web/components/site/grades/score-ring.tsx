import type { SubjectColor } from "@/lib/api/types";
import { fmtScore, percent } from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

/** Circular progress with the total in the middle, tinted by the subject. */
export function ScoreRing({
  total,
  max,
  color,
  size = 96,
  className,
}: {
  total: number;
  max: number;
  color: SubjectColor | "";
  size?: number;
  className?: string;
}) {
  const stroke = Math.max(6, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = percent(total, max);
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${fmtScore(total)} из ${fmtScore(max)}`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        width={size}
        height={size}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c - (c * p) / 100}
          className={cn(
            "transition-[stroke-dashoffset] duration-700 ease-out",
            subjectColor(color).text,
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span
          className="font-bold tabular-nums tracking-tight"
          style={{ fontSize: size / 4.2 }}
        >
          {fmtScore(total)}
        </span>
        <span
          className="mt-0.5 text-muted-foreground tabular-nums"
          style={{ fontSize: Math.max(10, size / 9) }}
        >
          из {fmtScore(max)}
        </span>
      </div>
    </div>
  );
}
