"use client";

import {
  ClipboardCheckIcon,
  LogInIcon,
  LogOutIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { UserAvatar } from "@/components/site/user-avatar";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Builds the /login link that returns to the current page. */
export function loginHref(pathname: string | null): string {
  const next = pathname && pathname !== "/login" ? pathname : "/me";
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Header account control: avatar dropdown when signed in, «Войти» otherwise. */
export function UserMenu({ className }: { className?: string }) {
  const { me, logout } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  if (!me) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={cn("gap-1.5", className)}
        render={<Link href={loginHref(pathname)} />}
      >
        <LogInIcon className="size-4" aria-hidden />
        <span>Войти</span>
      </Button>
    );
  }

  const onLogout = async () => {
    await logout();
    toast.success("Вы вышли");
    router.push("/");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("rounded-full", className)}
            aria-label="Меню аккаунта"
          />
        }
      >
        <UserAvatar name={me.user.name} photoUrl={me.user.photoUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5">
            <UserAvatar
              name={me.user.name}
              photoUrl={me.user.photoUrl}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {me.user.name}
              </span>
              {me.user.telegramUsername ? (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  @{me.user.telegramUsername}
                </span>
              ) : null}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/me" />}>
          <UserRoundIcon className="size-4" />
          Профиль
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/practice" />}>
          <ClipboardCheckIcon className="size-4" />
          Сдачи
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} variant="destructive">
          <LogOutIcon className="size-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
