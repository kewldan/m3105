import type { SubjectColor } from "@/lib/api/types";
import { subjectColor } from "@/lib/subject-colors";
import { subjectIcon } from "@/lib/subject-icons";
import { cn } from "@/lib/utils";

/** Rounded tile with the subject's icon in its color. */
export function SubjectIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | undefined | null;
  color: SubjectColor | "" | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = subjectIcon(icon);
  const c = subjectColor(color);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-12 rounded-2xl [&_svg]:size-6",
        c.badge,
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
