"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarSrc, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

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
      {photoUrl ? <AvatarImage src={avatarSrc(photoUrl)} alt="" /> : null}
      <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
