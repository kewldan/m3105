"use client";

import {
  CrosshairIcon,
  LogInIcon,
  SearchIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/site/empty-state";
import { IsuForm } from "@/components/site/grades/isu-form";
import { LetterChip } from "@/components/site/grades/letter-chip";
import { PartBars } from "@/components/site/grades/part-bars";
import { ScoreRing } from "@/components/site/grades/score-ring";
import { GroupBadge } from "@/components/site/group-badge";
import { SubjectIcon } from "@/components/site/subject-icon";
import { UserAvatar } from "@/components/site/user-avatar";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  GradeSourceSummary,
  GradesResponse,
  MeResponse,
} from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { fmtRelative, plural } from "@/lib/format";
import {
  fmtScore,
  type GroupStat,
  groupStats,
  histogram,
  LETTERS,
  mean,
  median,
  type RankedEntry,
  rank,
  toNextLetter,
} from "@/lib/grades";
import { subjectColor } from "@/lib/subject-colors";
import { cn } from "@/lib/utils";

type Scope = "group" | "course" | "site" | "groups";

/**
 * A row with its index in the response: names repeat (two «Иванов Иван» in
 * one group), so the index is the only stable key.
 */
type Row = RankedEntry & { key: number };

const MEDALS = ["🥇", "🥈", "🥉"];

// Больше столбцов в строку не влезает: тогда разбивка — только по клику.
const MAX_INLINE_PARTS = 8;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
    </div>
  );
}

/**
 * Right edge of the histogram: the whole scale once scores get going, and
 * zoomed to the best score early in the term, when everyone is near zero.
 */
function chartDomain(best: number, max: number): number {
  if (best >= max * 0.6 || best <= 0) return max;
  const step = best <= 20 ? 5 : best <= 50 ? 10 : 20;
  return Math.min(max, Math.ceil((best * 1.05) / step) * step);
}

/** Distribution of totals with letter thresholds and the student's bar marked. */
function Distribution({
  totals,
  mine,
  source,
}: {
  totals: number[];
  mine: number | null;
  source: GradeSourceSummary;
}) {
  const buckets = 20;
  const domain = chartDomain(Math.max(0, ...totals), source.maxTotal);
  const width = domain / buckets;
  const counts = histogram(totals, domain, buckets);
  const top = Math.max(1, ...counts);
  const myBucket =
    mine == null ? -1 : Math.min(buckets - 1, Math.floor(mine / width));
  const zoomed = domain < source.maxTotal;
  const c = subjectColor(source.subjectColor);
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          Распределение баллов
          {zoomed ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              · 0–{fmtScore(domain)} из {fmtScore(source.maxTotal)}
            </span>
          ) : null}
        </h3>
        {mine != null ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full", c.dot)} aria-hidden />
            вы здесь
          </span>
        ) : null}
      </div>
      <div className="relative">
        <div className="flex h-28 items-end gap-0.5" aria-hidden>
          {counts.map((n, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: buckets are fixed positions.
              key={i}
              className={cn(
                "flex-1 rounded-t-sm transition-[height] duration-500",
                i === myBucket ? c.dot : "bg-muted-foreground/25",
              )}
              style={{ height: n ? `${Math.max(4, (n / top) * 100)}%` : 0 }}
              title={`${fmtScore(i * width)}–${fmtScore((i + 1) * width)}: ${n}`}
            />
          ))}
        </div>
        {LETTERS.filter((l) => (l.min / 100) * source.maxTotal < domain).map(
          (l) => (
            <div
              key={l.letter}
              className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/20"
              style={{
                left: `${((l.min / 100) * source.maxTotal * 100) / domain}%`,
              }}
            >
              <span className="absolute -top-1 left-1 text-[10px] font-semibold text-muted-foreground">
                {l.letter}
              </span>
            </div>
          ),
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>0</span>
        <span>{fmtScore(domain / 2)}</span>
        <span>{fmtScore(domain)}</span>
      </div>
      <p className="sr-only">
        {totals.length} студентов, медиана {fmtScore(median(totals))}
      </p>
    </div>
  );
}

function RatingList({
  rows,
  source,
}: {
  rows: Row[];
  source: GradeSourceSummary;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ol className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map((r) => {
        const expanded = open === r.key;
        return (
          <li
            key={r.key}
            id={r.me ? "my-row" : undefined}
            className={cn(
              "scroll-mt-24",
              r.me && cn(subjectColor(source.subjectColor).soft, "font-medium"),
            )}
          >
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 sm:px-4"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : r.key)}
            >
              <span className="w-8 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
                {MEDALS[r.rank - 1] ?? r.rank}
              </span>
              <UserAvatar
                name={r.name}
                photoUrl={r.user?.photoUrl}
                size="sm"
                className={cn(!r.user && "opacity-60")}
              />
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm">{r.name}</span>
                <GroupBadge group={r.group} />
                {r.me ? (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    вы
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "hidden shrink-0 gap-1",
                  source.columns.length <= MAX_INLINE_PARTS && "md:flex",
                )}
              >
                {source.columns.map((col) => (
                  <span
                    key={col.key}
                    className={cn(
                      "w-9 rounded text-center text-xs tabular-nums",
                      r.parts[col.key]
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground/50",
                    )}
                    title={col.label}
                  >
                    {fmtScore(r.parts[col.key])}
                  </span>
                ))}
              </span>
              <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                {fmtScore(r.total)}
              </span>
              <LetterChip total={r.total} max={source.maxTotal} />
            </button>
            {expanded ? (
              <div className="px-4 pb-4 sm:pl-[4.75rem]">
                <PartBars
                  columns={source.columns}
                  parts={r.parts}
                  color={source.subjectColor}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Баллы менялись {fmtRelative(r.changedAt)}
                  {r.user ? " · есть аккаунт на сайте" : ""}
                </p>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function GroupsTable({
  stats,
  myGroup,
  max,
}: {
  stats: GroupStat[];
  myGroup: string;
  max: number;
}) {
  const top = Math.max(1e-9, ...stats.map((s) => s.mean));
  return (
    <ol className="divide-y overflow-hidden rounded-xl border bg-card">
      {stats.map((s, i) => (
        <li
          key={s.group}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 sm:px-4",
            s.group === myGroup && "bg-primary/5 font-medium",
          )}
        >
          <span className="w-8 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
            {MEDALS[i] ?? i + 1}
          </span>
          <span className="flex w-24 shrink-0 items-center gap-1.5 text-sm">
            <GroupBadge group={s.group} />
            {s.group}
          </span>
          <span className="hidden min-w-0 flex-1 sm:block">
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${(s.mean / top) * 100}%` }}
              />
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground sm:w-64 sm:flex-none">
            медиана {fmtScore(s.median)} · лучший {fmtScore(s.best)} · {s.count}{" "}
            чел.
          </span>
          <span
            className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums"
            title={`Средний балл из ${fmtScore(max)}`}
          >
            {fmtScore(s.mean)}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** My place card above the rating, computed from the loaded rows. */
function MyResult({
  me,
  ranked,
  groupSize,
  courseRank,
  siteRank,
  siteSize,
  source,
  grouped,
}: {
  me: RankedEntry;
  ranked: RankedEntry[];
  groupSize: number;
  courseRank: number;
  siteRank: number;
  siteSize: number;
  source: GradeSourceSummary;
  /** False for one group's sheet: no study-group place, the course is the sheet. */
  grouped: boolean;
}) {
  const places = grouped
    ? [
        { label: "в группе", rank: me.rank, size: groupSize },
        { label: "на курсе", rank: courseRank, size: ranked.length },
        { label: "на сайте", rank: siteRank, size: siteSize },
      ]
    : [
        { label: "в таблице", rank: courseRank, size: ranked.length },
        { label: "на сайте", rank: siteRank, size: siteSize },
      ];
  const next = toNextLetter(me.total, source.maxTotal);
  // Курс отсортирован по убыванию: с конца первый, кто выше, — ближайший.
  const nearestAhead = [...ranked].reverse().find((r) => r.total > me.total);
  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
      <ScoreRing
        total={me.total}
        max={source.maxTotal}
        color={source.subjectColor}
        size={112}
        className="self-center"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Ваш результат</h2>
          <LetterChip total={me.total} max={source.maxTotal} />
        </div>
        <dl
          className={cn(
            "grid gap-2 text-center sm:max-w-md",
            grouped ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          {places.map((p) => (
            <div key={p.label} className="rounded-xl bg-muted/60 px-2 py-2">
              <dt className="text-[11px] text-muted-foreground">{p.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {MEDALS[p.rank - 1] ?? ""}
                {p.rank || "—"}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  / {p.size}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground text-pretty">
          {next
            ? `До ${next.letter} не хватает ${fmtScore(next.points)}. `
            : "Это уже A — дальше только удержать. "}
          {nearestAhead
            ? `Чтобы подняться ${grouped ? "на курсе" : "в таблице"}, нужно ещё ${fmtScore(nearestAhead.total - me.total)}.`
            : courseRank === 1
              ? `Вы первый ${grouped ? "на курсе" : "в таблице"}.`
              : ""}
        </p>
      </div>
    </section>
  );
}

/** Rating of one score sheet: my result, distribution and the list by scope. */
export function GradesBoard({ initial }: { initial: GradesResponse }) {
  const router = useRouter();
  const pathname = usePathname();
  const { me: ctxMe, setMe } = useUser();
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const source = data.source;
  const myGroup = data.myGroup;
  // Таблица одной группы (английский): учебные группы в ней не сравниваются.
  const grouped = !source?.membersOnly;
  const hasGroup = grouped && data.rows.some((r) => r.group === myGroup);
  const [pickedScope, setScope] = useState<Scope>(
    hasGroup ? "group" : "course",
  );
  const scope: Scope =
    !grouped && (pickedScope === "group" || pickedScope === "groups")
      ? "course"
      : pickedScope;

  const rows = useMemo(
    () => data.rows.map((r, key) => ({ ...r, key })),
    [data.rows],
  );
  const course = useMemo(() => rank(rows), [rows]);
  const site = useMemo(() => rank(rows.filter((r) => r.user)), [rows]);
  const group = useMemo(
    () => rank(rows.filter((r) => r.group === myGroup)),
    [rows, myGroup],
  );
  const groups = useMemo(
    () => (source ? groupStats(data.rows, source.maxTotal) : []),
    [data.rows, source],
  );

  const scoped = scope === "group" ? group : scope === "site" ? site : course;
  const q = query.trim().toLowerCase();
  const visible = q
    ? scoped.filter(
        (r) =>
          r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q),
      )
    : scoped;
  const totals = scoped.map((r) => r.total);
  const mine = (grouped ? group : course).find((r) => r.me);

  const switchSource = async (id: number) => {
    if (id === source?.id) return;
    setLoading(true);
    try {
      const next = await userApi.grades(id);
      setData(next);
      setScope(
        !next.source?.membersOnly &&
          next.rows.some((r) => r.group === next.myGroup)
          ? "group"
          : "course",
      );
      router.replace(`${pathname}?source=${id}`, { scroll: false });
    } catch {
      toast.error("Не удалось загрузить баллы");
    } finally {
      setLoading(false);
    }
  };

  const onLinked = async (next: MeResponse) => {
    setMe(next);
    try {
      setData(await userApi.grades(source?.id));
    } catch {
      router.refresh();
    }
  };

  if (!source) {
    return (
      <EmptyState
        icon={TrophyIcon}
        title="Баллов пока нет"
        description="Как только администратор подключит таблицу с баллами, здесь появится рейтинг."
      />
    );
  }

  return (
    <div className="space-y-5">
      {data.sources.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {data.sources.map((s) => (
            <Button
              key={s.id}
              variant={s.id === source.id ? "default" : "outline"}
              size="sm"
              onClick={() => switchSource(s.id)}
              disabled={loading}
            >
              <SubjectIcon
                icon={s.subjectIcon}
                color={s.subjectColor}
                size="sm"
              />
              {s.title}
            </Button>
          ))}
        </div>
      ) : null}

      {mine ? (
        <MyResult
          me={mine}
          ranked={course}
          groupSize={group.length}
          courseRank={course.find((r) => r.me)?.rank ?? 0}
          siteRank={site.find((r) => r.me)?.rank ?? 0}
          siteSize={site.length}
          source={source}
          grouped={grouped}
        />
      ) : ctxMe ? (
        <section className="space-y-3 rounded-2xl border border-dashed p-5">
          <h2 className="font-semibold">
            {data.linked ? "Вас нет в этой таблице" : "Где вы в рейтинге?"}
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            {data.linked
              ? `Строки с номером ИСУ ${ctxMe.user.isu} в таблице «${source.title}» нет. Проверьте номер — или вы просто не записаны на этот предмет.`
              : "Укажите номер ИСУ: подсветим вашу строку, покажем место в группе и на курсе, а бот напишет, когда баллы изменятся."}
          </p>
          <IsuForm me={ctxMe} onSaved={onLinked} />
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground text-pretty">
            Войдите через Telegram и укажите номер ИСУ: подсветим вашу строку,
            покажем место в группе и на курсе, а бот напишет, когда баллы
            изменятся.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            render={<Link href="/login?next=%2Fgrades" />}
          >
            <LogInIcon data-icon="inline-start" />
            Войти
          </Button>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={scope === "groups" ? "Групп" : "Студентов"}
          value={String(scope === "groups" ? groups.length : scoped.length)}
        />
        <Stat label="Средний балл" value={fmtScore(mean(totals))} />
        <Stat label="Медиана" value={fmtScore(median(totals))} />
        <Stat
          label="Лучший"
          value={fmtScore(totals.length ? Math.max(...totals) : 0)}
        />
      </div>

      <Distribution
        totals={totals}
        mine={mine?.total ?? null}
        source={source}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
          <TabsList>
            {hasGroup ? (
              <TabsTrigger value="group">{myGroup}</TabsTrigger>
            ) : null}
            <TabsTrigger value="course">
              {grouped ? "Курс" : "Вся таблица"}
            </TabsTrigger>
            <TabsTrigger value="site">На сайте</TabsTrigger>
            {grouped ? (
              <TabsTrigger value="groups">
                <UsersIcon aria-hidden />
                Группы
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {loading ? <Spinner /> : null}
          {mine && scope !== "groups" && scoped.some((r) => r.me) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                requestAnimationFrame(() =>
                  document
                    .getElementById("my-row")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                );
              }}
            >
              <CrosshairIcon data-icon="inline-start" />
              Найти меня
            </Button>
          ) : null}
          {scope !== "groups" ? (
            <InputGroup className="sm:w-56">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Фамилия или группа"
                aria-label="Поиск по рейтингу"
              />
            </InputGroup>
          ) : null}
        </div>
      </div>

      {scope === "groups" ? (
        <GroupsTable stats={groups} myGroup={myGroup} max={source.maxTotal} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={scope === "site" ? UsersIcon : SearchIcon}
          title={
            q
              ? "Никого не нашлось"
              : scope === "site"
                ? "Пока никто не привязал ИСУ"
                : "Пусто"
          }
          description={
            scope === "site" && !q
              ? "Здесь соревнуются те, кто зарегистрирован на сайте и указал номер ИСУ в профиле."
              : undefined
          }
          className="py-8"
        />
      ) : (
        <RatingList key={source.id} rows={visible} source={source} />
      )}

      <p className="text-xs text-muted-foreground">
        Данные из таблицы преподавателя
        {source.syncedAt ? `, сверены ${fmtRelative(source.syncedAt)}` : ""}.
        Места делят студенты с одинаковым баллом. Аватар — у тех, кто есть на
        сайте; в рейтинге «На сайте» — {site.length}{" "}
        {plural(site.length, "человек", "человека", "человек")}.
      </p>
    </div>
  );
}
