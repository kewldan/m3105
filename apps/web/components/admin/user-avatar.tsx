"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Initials from a full name: "Иван Петров" → "ИП". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** Student avatar with Telegram photo or initials fallback. */
export function UserAvatar({
  name,
  photoUrl,
  size = "default",
  className,
}: {
  name: string;
  photoUrl?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn(className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
