"use client";

import { ClipboardCheckIcon, MapPinIcon } from "lucide-react";
import Link from "next/link";

import { Section } from "@/components/site/section";
import { SubjectBadge } from "@/components/site/subject-badge";
import { useUser } from "@/components/site/user-provider";
import { fmtDateTime, fmtTime } from "@/lib/format";

/** Home widget with the signed-in student's next practice signups. */
export function MySignups({ tz, now }: { tz: string; now: string }) {
  const { me } = useUser();
  if (!me) return null;
  const nowMs = new Date(now).getTime();
  const upcoming = me.signups
    .filter(
      (s) =>
        new Date(s.session.endsAt ?? s.session.startsAt).getTime() >=
        nowMs - 60 * 60 * 1000,
    )
    .slice(0, 3);

  return (
    <Section title="Мои сдачи" href="/practice" hrefLabel="Все">
      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-4 py-5 text-sm text-muted-foreground">
          Вы пока никуда не записаны.{" "}
          <Link
            href="/practice"
            className="font-medium text-primary hover:underline"
          >
            Выбрать сдачу
          </Link>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {upcoming.map((s) => (
            <li key={s.session.id}>
              <Link
                href={`/practice?session=${s.session.id}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <ClipboardCheckIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium first-letter:uppercase">
                    {fmtDateTime(s.session.startsAt, tz)}
                    {s.session.endsAt
                      ? `–${fmtTime(s.session.endsAt, tz)}`
                      : ""}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <SubjectBadge
                      name={s.session.subjectShortName || s.session.subjectName}
                      color={s.session.subjectColor}
                    />
                    {s.session.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="size-3" aria-hidden />
                        {s.session.location}
                      </span>
                    ) : null}
                    <span>
                      {s.labs.map((l) => `Лаба ${l.number}`).join(", ")}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
