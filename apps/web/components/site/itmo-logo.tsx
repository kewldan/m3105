import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Square ITMO mark built from the official wordmark: white mark on a black
 * tile in the light theme, black mark on a white tile in the dark theme
 * (the two official "plaque" variants).
 */
export function ItmoLogo({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-foreground",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Image
        src="/itmo-wordmark-white.png"
        alt=""
        width={640}
        height={252}
        priority
        className="dark:invert"
        style={{ width: Math.round(size * 0.8), height: "auto" }}
      />
    </span>
  );
}
