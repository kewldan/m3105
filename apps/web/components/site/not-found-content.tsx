"use client";

import {
  ArrowLeftIcon,
  BookOpenTextIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  FlaskConicalIcon,
  HelpCircleIcon,
  HomeIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/calendar", label: "Календарь", icon: CalendarDaysIcon },
  { href: "/labs", label: "Лабы", icon: FlaskConicalIcon },
  { href: "/practice", label: "Сдачи", icon: ClipboardCheckIcon },
  { href: "/notes", label: "Конспекты", icon: BookOpenTextIcon },
  { href: "/faq", label: "ЧаВо", icon: HelpCircleIcon },
];

const ease = [0.22, 1, 0.36, 1] as const;

/** Body of the 404 page, shared by the root and the (site) not-found routes. */
export function NotFoundContent() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease, delay },
  });

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center py-10 text-center">
      <motion.div
        {...fade(0)}
        aria-hidden
        className="font-heading text-[7rem] leading-none font-bold tracking-tighter text-transparent select-none bg-linear-to-b from-foreground/80 to-foreground/20 bg-clip-text sm:text-[9rem]"
      >
        404
      </motion.div>
      <motion.h1
        {...fade(0.08)}
        className="mt-4 text-2xl font-bold tracking-tight text-balance break-words sm:text-3xl"
      >
        Такой страницы нет
      </motion.h1>
      <motion.p
        {...fade(0.14)}
        className="mt-3 max-w-md text-muted-foreground text-pretty"
      >
        Возможно, её переименовали, ещё не опубликовали или в адресе опечатка.
      </motion.p>
      <motion.div
        {...fade(0.2)}
        className="mt-6 flex flex-wrap items-center justify-center gap-2"
      >
        <Button render={<Link href="/" />} size="lg">
          <HomeIcon data-icon="inline-start" />
          На главную
        </Button>
        <Button variant="outline" size="lg" onClick={() => router.back()}>
          <ArrowLeftIcon data-icon="inline-start" />
          Назад
        </Button>
      </motion.div>
      <motion.nav
        {...fade(0.28)}
        aria-label="Разделы сайта"
        className="mt-10 flex flex-wrap items-center justify-center gap-2"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <l.icon className="size-3.5" aria-hidden />
            {l.label}
          </Link>
        ))}
      </motion.nav>
    </div>
  );
}
