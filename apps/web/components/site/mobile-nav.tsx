"use client";

import {
  ClipboardCheckIcon,
  ExternalLinkIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { isActivePath, type NavLink } from "@/components/site/nav-config";
import { UserAvatar } from "@/components/site/user-avatar";
import { loginHref } from "@/components/site/user-menu";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Link as ExtLink } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function MobileNav({
  links,
  extLinks,
  title,
}: {
  links: NavLink[];
  extLinks: ExtLink[];
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { me, logout } = useUser();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Открыть меню"
          />
        }
      >
        <MenuIcon className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-xs gap-0">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-lg">{title}</SheetTitle>
        </SheetHeader>
        <nav aria-label="Меню" className="flex flex-col gap-0.5 px-2">
          {links.map((link) => {
            const active = isActivePath(pathname, link);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={close}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Separator className="my-3" />
        <div className="px-2">
          {me ? (
            <>
              <div className="flex items-center gap-3 px-3 py-2">
                <UserAvatar name={me.user.name} photoUrl={me.user.photoUrl} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {me.user.name}
                  </div>
                  {me.user.telegramUsername ? (
                    <div className="truncate text-xs text-muted-foreground">
                      @{me.user.telegramUsername}
                    </div>
                  ) : null}
                </div>
              </div>
              <Link
                href="/me"
                onClick={close}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <UserRoundIcon className="size-4" aria-hidden />
                Профиль
              </Link>
              <Link
                href="/practice"
                onClick={close}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ClipboardCheckIcon className="size-4" aria-hidden />
                Мои сдачи
              </Link>
              <button
                type="button"
                onClick={async () => {
                  close();
                  await logout();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOutIcon className="size-4" aria-hidden />
                Выйти
              </button>
            </>
          ) : (
            <Link
              href={loginHref(pathname)}
              onClick={close}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <LogInIcon className="size-4" aria-hidden />
              Войти
            </Link>
          )}
        </div>
        {extLinks.length > 0 ? (
          <>
            <Separator className="my-3" />
            <div className="px-2">
              <div className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Ссылки
              </div>
              {extLinks.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {l.title}
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
              ))}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
