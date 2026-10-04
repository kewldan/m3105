"use client";

import {
  CheckCircle2Icon,
  ClockIcon,
  LogInIcon,
  MapPinIcon,
  UsersRoundIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import {
  isPending,
  PendingNotice,
} from "@/components/site/auth/pending-notice";
import { QueueList } from "@/components/site/practice/queue-list";
import { SignupDialog } from "@/components/site/practice/signup-dialog";
import { SubjectBadge } from "@/components/site/subject-badge";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import type { PracticeSessionView } from "@/lib/api/types";
import { fmtDateTime, fmtTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One practice session with seats, participants and the signup control. */
export function SessionCard({
  session,
  tz,
  highlighted = false,
  onChange,
}: {
  session: PracticeSessionView;
  tz: string;
  highlighted?: boolean;
  onChange: (next: PracticeSessionView) => void;
}) {
  const reduce = useReducedMotion();
  const { me } = useUser();
  const [open, setOpen] = useState(false);
  const mine = session.myLabIds.length > 0;
  const seatsLeft =
    session.capacity != null
      ? Math.max(0, session.capacity - session.queue.length)
      : null;

  return (
    <motion.article
      id={`session-${session.id}`}
      layout={!reduce}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-card p-4 transition-shadow sm:p-5",
        mine && "border-emerald-500/40",
        highlighted && "ring-2 ring-primary/40",
        session.past && "opacity-70",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SubjectBadge
              name={session.subjectShortName || session.subjectName}
              color={session.subjectColor}
              slug={session.subjectSlug}
            />
            {mine ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2Icon className="size-3" aria-hidden />
                Вы записаны
              </span>
            ) : null}
            {session.full && !session.past ? (
              <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Дальше — резерв
              </span>
            ) : null}
            {session.past ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Прошла
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
              {fmtTime(session.startsAt, tz)}
              {session.endsAt ? `–${fmtTime(session.endsAt, tz)}` : ""}
            </span>
            {session.location ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <MapPinIcon className="size-4" aria-hidden />
                {session.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <UsersRoundIcon className="size-4" aria-hidden />
              {session.capacity != null
                ? `${session.queue.length} из ${session.capacity} ${plural(session.capacity, "защиты", "защит", "защит")}`
                : `${session.signupsCount} ${plural(session.signupsCount, "человек", "человека", "человек")}`}
              {seatsLeft != null && seatsLeft > 0 && !session.past
                ? ` · свободно ${seatsLeft}`
                : ""}
            </span>
          </div>
          {session.note ? (
            <p className="text-sm text-muted-foreground text-pretty">
              {session.note}
            </p>
          ) : null}
          {mine ? (
            <p className="text-xs text-muted-foreground">
              Ваши лабы:{" "}
              {session.availableLabs
                .filter((l) => session.myLabIds.includes(l.id))
                .map((l) => `№${l.number}`)
                .join(", ") || "—"}
            </p>
          ) : null}
        </div>
        {!session.past ? (
          <div className="flex shrink-0 items-center gap-2">
            {isPending(me) ? (
              <PendingNotice compact />
            ) : me ? (
              <Button
                type="button"
                variant={mine ? "outline" : "default"}
                onClick={() => setOpen(true)}
              >
                {mine ? "Изменить запись" : "Записаться"}
              </Button>
            ) : (
              <Button
                variant="outline"
                render={<Link href="/login?next=%2Fpractice" />}
              >
                <LogInIcon data-icon="inline-start" />
                Войдите, чтобы записаться
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {session.queue.length > 0 ? (
        <div className="mt-4 space-y-2">
          <QueueList queue={session.queue} meId={me?.user.id} />
          {!session.past ? (
            <p className="text-xs text-muted-foreground">
              {session.frozen
                ? "Порядок заморожен: новые записи встают в конец."
                : `Порядок окончательный с ${fmtDateTime(session.freezesAt, tz)}; до этого его может поменять новая запись.`}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Пока никто не записался.
        </p>
      )}

      {me ? (
        <SignupDialog
          session={session}
          open={open}
          onOpenChange={setOpen}
          onSaved={onChange}
          tz={tz}
        />
      ) : null}
    </motion.article>
  );
}
