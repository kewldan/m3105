"use client";

import {
  ArrowDownAZIcon,
  ArrowDownWideNarrowIcon,
  ChevronRightIcon,
  FlaskConicalIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { DeadlineBadge, deadlineState } from "@/components/site/deadline-badge";
import { EmptyState } from "@/components/site/empty-state";
import { DoneToggle } from "@/components/site/labs/done-toggle";
import { useLabsDone } from "@/components/site/labs/use-labs-done";
import { SubjectBadge } from "@/components/site/subject-badge";
import { loginHref } from "@/components/site/user-menu";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Lab } from "@/lib/api/types";
import { fmtDateTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "upcoming" | "overdue" | "none" | "done";
type Sort = "deadline" | "subject";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Все лабы" },
  { value: "upcoming", label: "Предстоящие" },
  { value: "overdue", label: "Просроченные" },
  { value: "none", label: "Без дедлайна" },
  { value: "done", label: "Сданные" },
];

type SubjectOption = { value: string; label: string };

export function LabsBrowser({
  labs,
  now,
  tz,
}: {
  labs: Lab[];
  now: string;
  tz: string;
}) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const { isDone, toggle, done, signedIn } = useLabsDone();
  const [subject, setSubject] = useState<SubjectOption | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("deadline");
  const [hideDone, setHideDone] = useState(true);

  const subjectOptions = useMemo<SubjectOption[]>(() => {
    const map = new Map<string, string>();
    for (const l of labs) map.set(l.subjectSlug, l.subjectName);
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [labs]);

  const filtered = useMemo(() => {
    const list = labs.filter((l) => {
      if (subject && l.subjectSlug !== subject.value) return false;
      const finished = isDone(l.id);
      if (signedIn && hideDone && finished && status !== "done") return false;
      switch (status) {
        case "upcoming":
          return (
            !!l.deadlineAt &&
            deadlineState(l.deadlineAt, now, tz).state !== "overdue" &&
            !finished
          );
        case "overdue":
          return (
            !!l.deadlineAt &&
            deadlineState(l.deadlineAt, now, tz).state === "overdue" &&
            !finished
          );
        case "none":
          return !l.deadlineAt;
        case "done":
          return finished;
        default:
          return true;
      }
    });
    if (sort === "deadline") {
      list.sort((a, b) => {
        if (!a.deadlineAt && !b.deadlineAt)
          return (
            a.subjectName.localeCompare(b.subjectName, "ru") ||
            a.number - b.number
          );
        if (!a.deadlineAt) return 1;
        if (!b.deadlineAt) return -1;
        return (
          new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime()
        );
      });
    }
    return list;
  }, [labs, subject, status, sort, now, tz, isDone, signedIn, hideDone]);

  const total = labs.length;
  const doneCount = labs.filter((l) => done.has(l.id)).length;
  const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  if (labs.length === 0) {
    return (
      <EmptyState
        icon={FlaskConicalIcon}
        title="Лаб пока нет"
        description="Как только преподаватели выдадут задания, они появятся здесь."
      />
    );
  }

  return (
    <div className="space-y-5">
      {signedIn ? (
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Мой прогресс</div>
            <div
              className="text-sm text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {doneCount} из {total} · {percent}%
            </div>
          </div>
          <Progress
            value={percent}
            className="mt-3"
            aria-label="Доля сданных лаб"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Отмечайте сданные кружком. Отметки видны только вам.
            </p>
            <Label className="flex items-center gap-2 text-xs font-medium">
              <Switch
                size="sm"
                checked={hideDone}
                onCheckedChange={setHideDone}
              />
              Скрыть сданные
            </Label>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Отмечайте сданные лабы</div>
            <p className="text-xs text-muted-foreground">
              Войдите, чтобы вести прогресс и записываться на сдачу.
            </p>
          </div>
          <Link
            href={loginHref(pathname)}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Войти
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Combobox
          items={subjectOptions}
          value={subject}
          onValueChange={(v) => setSubject(v as SubjectOption | null)}
          itemToStringLabel={(item) => (item as SubjectOption).label}
        >
          <ComboboxInput
            placeholder="Все предметы"
            showClear
            className="sm:w-60"
            aria-label="Предмет"
          />
          <ComboboxContent>
            <ComboboxEmpty>Ничего не найдено</ComboboxEmpty>
            <ComboboxList>
              {(item: SubjectOption) => (
                <ComboboxItem key={item.value} value={item}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Select
          value={status}
          onValueChange={(v) => setStatus((v as StatusFilter | null) ?? "all")}
          items={STATUS_OPTIONS}
        >
          <SelectTrigger className="sm:min-w-44" aria-label="Статус">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          value={[sort]}
          onValueChange={(v) => {
            const next = v[0] as Sort | undefined;
            if (next) setSort(next);
          }}
          variant="outline"
          spacing={0}
          className="sm:ml-auto"
          aria-label="Сортировка"
        >
          <ToggleGroupItem
            value="deadline"
            className="aria-pressed:bg-muted data-pressed:bg-muted"
          >
            <ArrowDownWideNarrowIcon data-icon="inline-start" />
            По дедлайну
          </ToggleGroupItem>
          <ToggleGroupItem
            value="subject"
            className="aria-pressed:bg-muted data-pressed:bg-muted"
          >
            <ArrowDownAZIcon data-icon="inline-start" />
            По предмету
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length} {plural(filtered.length, "лаба", "лабы", "лаб")}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FlaskConicalIcon}
          title="Под фильтры ничего не попало"
          description="Попробуйте выбрать другой предмет или статус."
        />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {filtered.map((lab) => {
              const finished = isDone(lab.id);
              return (
                <motion.li
                  key={lab.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition-colors hover:border-primary/40 sm:px-4",
                      finished && "opacity-70",
                    )}
                  >
                    <DoneToggle
                      checked={finished}
                      disabled={!signedIn}
                      onToggle={() => toggle(lab.id)}
                    />
                    <Link
                      href={`/labs/${lab.subjectSlug}/${lab.slug}`}
                      className="flex min-w-0 flex-1 items-center gap-3 outline-none"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <SubjectBadge
                            name={lab.subjectShortName || lab.subjectName}
                            color={lab.subjectColor}
                          />
                          <span className="text-xs text-muted-foreground">
                            Лаба {lab.number}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "font-medium leading-snug",
                            finished &&
                              "line-through decoration-muted-foreground/60",
                          )}
                        >
                          {lab.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {lab.deadlineAt
                            ? `Дедлайн: ${fmtDateTime(lab.deadlineAt, tz)}`
                            : "Дедлайн не назначен"}
                          {lab.maxScore != null
                            ? ` · до ${lab.maxScore} ${plural(lab.maxScore, "балла", "баллов", "баллов")}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {finished ? (
                          <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Сдано
                          </span>
                        ) : (
                          <DeadlineBadge
                            deadlineAt={lab.deadlineAt}
                            now={now}
                            tz={tz}
                          />
                        )}
                        <ChevronRightIcon
                          className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
                          aria-hidden
                        />
                      </div>
                    </Link>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
