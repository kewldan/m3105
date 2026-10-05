import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarSrc, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/** Our copy of the Telegram photo; initials while it loads and when there is none. */
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
      {photoUrl ? <AvatarImage src={avatarSrc(photoUrl)} alt="" /> : null}
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
