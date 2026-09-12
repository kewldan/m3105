"use client";

import {
  BookOpenTextIcon,
  CalendarDaysIcon,
  ClockIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { WeekChip } from "@/components/site/week-chip";
import { Button } from "@/components/ui/button";
import type { Settings, Week } from "@/lib/api/types";
import { fmtWeekdayDate, inTz } from "@/lib/format";

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

export function Hero({
  settings,
  week,
  now,
}: {
  settings: Settings;
  week: Week;
  now: string;
}) {
  const reduce = useReducedMotion();
  const tz = settings.timezone;
  const hour = inTz(now, tz).getHours();
  const items = [
    {
      children: (
        <>
          {greeting(hour)}, {settings.groupName}
        </>
      ),
      cls: "text-sm font-medium text-primary",
    },
    {
      children: (
        <span className="inline-block first-letter:uppercase">
          {fmtWeekdayDate(now, tz)}
        </span>
      ),
      cls: "font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl",
    },
  ];
  return (
    <section className="relative overflow-hidden rounded-3xl border bg-card px-6 py-8 sm:px-10 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-muted blur-3xl"
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          {items.map((it, i) => (
            <motion.div
              key={it.cls}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={it.cls}
            >
              {it.children}
            </motion.div>
          ))}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            {week.configured && week.number > 0 ? (
              <WeekChip week={week} size="lg" />
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                <ClockIcon className="size-4" aria-hidden />
                Даты семестра ещё не заданы
              </span>
            )}
            {week.configured && !week.inRange ? (
              <span className="text-sm text-muted-foreground">
                Сейчас каникулы или сессия — чётность недели условная.
              </span>
            ) : null}
          </motion.div>
          {settings.description ? (
            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="max-w-xl text-muted-foreground text-pretty"
            >
              {settings.description}
            </motion.p>
          ) : null}
        </div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap gap-2"
        >
          <Button render={<Link href="/calendar" />} size="lg">
            <CalendarDaysIcon data-icon="inline-start" />
            Календарь
          </Button>
          <Button render={<Link href="/labs" />} size="lg" variant="outline">
            <FlaskConicalIcon data-icon="inline-start" />
            Лабы
          </Button>
          <Button render={<Link href="/notes" />} size="lg" variant="outline">
            <BookOpenTextIcon data-icon="inline-start" />
            Конспекты
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
