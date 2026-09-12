import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
} from "lucide-react";
import Link from "next/link";

import { DeadlineBadge } from "@/components/site/deadline-badge";
import { EmptyState } from "@/components/site/empty-state";
import { SubjectBadge } from "@/components/site/subject-badge";
import type { CalendarItem } from "@/lib/api/types";
import {
  DEFAULT_TZ,
  EVENT_KIND_LABEL,
  fmtDateTime,
  fmtWeekdayDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<string, string> = {
  deadline: "bg-primary/10 text-primary",
  practice: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  test: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
  exam: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  consultation: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  other: "bg-muted text-muted-foreground",
};

export function KindPill({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        KIND_STYLE[kind] ?? KIND_STYLE.other,
        className,
      )}
    >
      {EVENT_KIND_LABEL[kind] ?? "Событие"}
    </span>
  );
}

/** One calendar item as a row: link to the lab page or external url. */
export function DeadlineRow({
  item,
  now,
  tz = DEFAULT_TZ,
  compact = false,
}: {
  item: CalendarItem;
  now: string;
  tz?: string;
  compact?: boolean;
}) {
  const href = item.path || item.url || undefined;
  const external = !item.path && !!item.url;
  const body = (
    <>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {item.subject ? (
            <SubjectBadge
              name={item.subject.shortName || item.subject.name}
              color={item.subject.color}
            />
          ) : null}
          <KindPill kind={item.kind} />
        </div>
        <div
          className={cn(
            "font-medium leading-snug text-pretty",
            compact ? "text-sm" : "text-base",
          )}
        >
          {item.title}
        </div>
        <div className="text-xs text-muted-foreground">
          {item.allDay
            ? fmtWeekdayDate(item.startsAt, tz)
            : fmtDateTime(item.startsAt, tz)}
          {item.location ? ` · ${item.location}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
        <DeadlineBadge deadlineAt={item.startsAt} now={now} tz={tz} />
        {href ? (
          external ? (
            <ExternalLinkIcon
              className="size-4 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <ArrowUpRightIcon
              className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden
            />
          )
        ) : null}
      </div>
    </>
  );
  const cls = cn(
    "group flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 transition-colors sm:flex-row sm:items-center",
    href && "hover:border-primary/40 hover:bg-accent/40",
  );
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function DeadlineList({
  items,
  now,
  tz = DEFAULT_TZ,
  emptyTitle = "Пока ничего не запланировано",
  emptyDescription = "Как только появятся дедлайны или события, они окажутся здесь.",
  compact,
}: {
  items: CalendarItem[];
  now: string;
  tz?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClockIcon}
        title={emptyTitle}
        description={emptyDescription}
        className="py-8"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <DeadlineRow item={item} now={now} tz={tz} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
