import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Initials for a display name: "Аня Смирнова" → "АС". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

/** Avatar with the Telegram photo or initials fallback. */
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
    <Avatar size={size} className={className}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "bg-primary/10 font-medium text-primary",
          size === "lg" && "text-base",
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
