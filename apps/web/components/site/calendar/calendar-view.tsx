"use client";

import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import {
  BookMarkedIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { SubscribeDialog } from "@/components/site/calendar/subscribe-dialog";
import { DeadlineList } from "@/components/site/deadline-list";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalendarItem } from "@/lib/api/types";
import { fmtWeekdayDate, inTz, toYmd, WEEKDAYS_SHORT } from "@/lib/format";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

const ALL = "__all__";

type Cell = {
  ymd: string;
  day: number;
  inMonth: boolean;
  items: CalendarItem[];
};

/** YYYY-MM-DD from the local calendar components (cells are built in local time). */
function localYmd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function buildMonth(month: Date, byDay: Map<string, CalendarItem[]>): Cell[] {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const cells: Cell[] = [];
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - startOffset);
  const total = Math.ceil((startOffset + last.getDate()) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const ymd = localYmd(cursor);
    cells.push({
      ymd,
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month.getMonth(),
      items: byDay.get(ymd) ?? [],
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

export function CalendarView({
  items,
  now,
  tz,
}: {
  items: CalendarItem[];
  now: string;
  tz: string;
}) {
  const reduce = useReducedMotion();
  const today = toYmd(now, tz);
  const [month, setMonth] = useState<Date>(() => {
    const d = inTz(now, tz);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [direction, setDirection] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>(ALL);

  const subjects = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const it of items)
      if (it.subject)
        map.set(it.subject.slug, {
          slug: it.subject.slug,
          name: it.subject.name,
        });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [items]);

  const filtered = useMemo(
    () => items.filter((it) => subject === ALL || it.subject?.slug === subject),
    [items, subject],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of filtered) {
      const key = toYmd(it.startsAt, tz);
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return map;
  }, [filtered, tz]);
  const cells = useMemo(() => buildMonth(month, byDay), [month, byDay]);
  const monthLabel = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(month);

  const upcoming = useMemo(
    () =>
      filtered
        .filter(
          (it) => new Date(it.startsAt).getTime() >= new Date(now).getTime(),
        )
        .slice(0, 8),
    [filtered, now],
  );
  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  const go = (delta: number) => {
    setDirection(delta);
    setMonth((m) => addMonths(m, delta));
    setSelected(null);
  };

  const monthVariants = {
    enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -24 }),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={subject}
            onValueChange={(v) => setSubject((v as string | null) ?? ALL)}
            items={[
              { value: ALL, label: "Все предметы" },
              ...subjects.map((s) => ({ value: s.slug, label: s.name })),
            ]}
          >
            <SelectTrigger className="min-w-44" aria-label="Предмет">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все предметы</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.slug} value={s.slug}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SubscribeDialog subject={subject === ALL ? undefined : subject} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => go(-1)}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeftIcon />
            </Button>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold first-letter:uppercase">
                {monthLabel}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const d = inTz(now, tz);
                  setDirection(0);
                  setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  setSelected(today);
                }}
              >
                Сегодня
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => go(1)}
              aria-label="Следующий месяц"
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {WEEKDAYS_SHORT.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={month.toISOString()}
                custom={direction}
                variants={monthVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-7 gap-1"
              >
                {cells.map((cell) => {
                  const isToday = cell.ymd === today;
                  const isSel = cell.ymd === selected;
                  const hasItems = cell.items.length > 0;
                  return (
                    <button
                      type="button"
                      key={cell.ymd}
                      onClick={() => setSelected(isSel ? null : cell.ymd)}
                      aria-pressed={isSel}
                      aria-label={`${fmtWeekdayDate(`${cell.ymd}T12:00:00Z`, tz)}${hasItems ? `, событий: ${cell.items.length}` : ""}`}
                      className={cn(
                        "flex min-h-14 flex-col items-stretch gap-1 rounded-lg border p-1 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-20",
                        cell.inMonth
                          ? "bg-card"
                          : "bg-muted/30 text-muted-foreground",
                        hasItems && "hover:border-primary/40",
                        isSel && "border-primary ring-2 ring-primary/30",
                      )}
                    >
                      <span
                        className={cn(
                          "ml-auto flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                          isToday &&
                            "bg-primary font-semibold text-primary-foreground",
                        )}
                      >
                        {cell.day}
                      </span>
                      {hasItems ? (
                        <>
                          <div className="flex flex-wrap gap-0.5 sm:hidden">
                            {cell.items.slice(0, 4).map((it) => (
                              <span
                                key={it.id}
                                className={cn(
                                  "size-1.5 rounded-full",
                                  it.subject
                                    ? subjectColor(it.subject.color).dot
                                    : "bg-primary",
                                )}
                              />
                            ))}
                          </div>
                          <div className="hidden flex-col gap-0.5 sm:flex">
                            {cell.items.slice(0, 2).map((it) => {
                              const Icon = FlaskConicalIcon;
                              const c = it.subject
                                ? subjectColor(it.subject.color)
                                : null;
                              return (
                                <span
                                  key={it.id}
                                  className={cn(
                                    "inline-flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight",
                                    c ? c.badge : "bg-primary/10 text-primary",
                                  )}
                                >
                                  <Icon
                                    className="size-3 shrink-0"
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {it.subject
                                      ? it.subject.shortName || it.subject.name
                                      : it.title}
                                  </span>
                                </span>
                              );
                            })}
                            {cell.items.length > 2 ? (
                              <span className="px-1 text-[11px] text-muted-foreground">
                                +{cell.items.length - 2}
                              </span>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <aside className="space-y-3 lg:col-span-1">
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div
                key={selected}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-base font-semibold first-letter:uppercase">
                    <CalendarIcon className="size-4 text-primary" aria-hidden />
                    {fmtWeekdayDate(`${selected}T12:00:00Z`, tz)}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(null)}
                  >
                    Ближайшие
                  </Button>
                </div>
                <DeadlineList
                  items={selectedItems}
                  now={now}
                  tz={tz}
                  compact
                  emptyTitle="В этот день ничего нет"
                  emptyDescription="Выберите другой день или посмотрите ближайшие события."
                />
              </motion.div>
            ) : (
              <motion.div
                key="upcoming"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <BookMarkedIcon className="size-4 text-primary" aria-hidden />
                  Ближайшие
                </h3>
                <DeadlineList
                  items={upcoming}
                  now={now}
                  tz={tz}
                  compact
                  emptyTitle="Впереди ничего нет"
                  emptyDescription="Попробуйте снять фильтры или загляните позже."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}
