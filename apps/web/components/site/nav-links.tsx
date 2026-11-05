"use client";

import { ChevronDownIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { isActivePath, type NavLink } from "@/components/site/nav-config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MORE_KEY = "__more__";
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Desktop navigation. The active background is a single pill that slides
 * horizontally between items (x and width only), so it never "flies in"
 * from another row. Extra links go into "Ещё".
 */
export function NavLinks({
  links,
  more = [],
  className,
}: {
  links: NavLink[];
  more?: NavLink[];
  className?: string;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const moreActive = more.some((l) => isActivePath(pathname, l));
  const activeKey =
    links.find((l) => isActivePath(pathname, l))?.href ??
    (moreActive ? MORE_KEY : null);

  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const nav = navRef.current;
    const el = activeKey ? itemRefs.current.get(activeKey) : undefined;
    if (!nav || !el) {
      setPill(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    setPill({ x: rect.left - navRect.left, width: rect.width });
  }, [activeKey]);

  useIsoLayoutEffect(() => {
    measure();
    // The first measurement positions the pill without animating.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [measure]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(nav);
    return () => ro.disconnect();
  }, [measure]);

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) itemRefs.current.set(key, el);
    else itemRefs.current.delete(key);
  };

  const itemClass = (active: boolean) =>
    cn(
      "relative z-10 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      active
        ? "text-foreground"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <nav
      ref={navRef}
      aria-label="Основная навигация"
      className={cn("relative isolate flex items-center gap-0.5", className)}
    >
      {pill ? (
        <motion.span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 rounded-lg bg-accent"
          initial={false}
          animate={{ x: pill.x, width: pill.width }}
          transition={
            reduce || !ready
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 34 }
          }
        />
      ) : null}
      {links.map((link) => {
        const active = link.href === activeKey;
        return (
          <Link
            key={link.href}
            ref={register(link.href)}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={itemClass(active)}
          >
            {link.label}
          </Link>
        );
      })}
      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            ref={register(MORE_KEY)}
            className={cn(
              itemClass(moreActive),
              "inline-flex items-center gap-1",
            )}
          >
            Ещё
            <ChevronDownIcon className="size-3.5 opacity-70" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {more.map((link) => (
              <DropdownMenuItem
                key={link.href}
                render={<Link href={link.href} />}
                className={cn(isActivePath(pathname, link) && "bg-accent")}
              >
                {link.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}
