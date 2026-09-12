"use client";

import {
  CalendarPlusIcon,
  CheckCircle2Icon,
  ClockIcon,
  LogInIcon,
  MapPinIcon,
  UsersRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { signupErrorMessage } from "@/components/site/practice/signup-dialog";
import { loginHref } from "@/components/site/user-menu";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { PracticeSessionView } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { fmtDateTime, fmtTime, fmtWeekdayDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** «Записаться на сдачу» for one lab: pick an upcoming session of its subject. */
export function SignupButton({
  labId,
  subjectSlug,
  tz,
  className,
}: {
  labId: number;
  subjectSlug: string;
  tz: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { me, refresh } = useUser();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<PracticeSessionView[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const current =
    me?.signups.find((s) => s.labs.some((l) => l.id === labId)) ?? null;

  useEffect(() => {
    if (!open || sessions) return;
    userApi
      .practiceList({ subject: subjectSlug })
      .then((res) => setSessions(res.sessions))
      .catch(() => {
        toast.error("Не удалось загрузить сдачи");
        setSessions([]);
      });
  }, [open, sessions, subjectSlug]);

  if (!me) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        render={<Link href={loginHref(pathname)} />}
      >
        <LogInIcon data-icon="inline-start" />
        Войти, чтобы записаться на сдачу
      </Button>
    );
  }

  const choose = async (session: PracticeSessionView) => {
    setBusy(session.id);
    try {
      const has = session.myLabIds.includes(labId);
      const ids = has
        ? session.myLabIds.filter((id) => id !== labId)
        : [...session.myLabIds, labId];
      const next = await userApi.practiceSignup(session.id, ids);
      setSessions(
        (list) => list?.map((s) => (s.id === next.id ? next : s)) ?? null,
      );
      await refresh();
      toast.success(
        has
          ? "Лаба убрана из записи"
          : `Вы записаны на ${fmtDateTime(session.startsAt, tz)}`,
      );
      if (!has) setOpen(false);
    } catch (err) {
      toast.error(signupErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Button
          type="button"
          size="sm"
          variant={current ? "outline" : "default"}
          onClick={() => setOpen(true)}
        >
          {current ? (
            <CheckCircle2Icon data-icon="inline-start" />
          ) : (
            <CalendarPlusIcon data-icon="inline-start" />
          )}
          {current ? "Изменить сдачу" : "Записаться на сдачу"}
        </Button>
        {current ? (
          <span className="text-xs text-muted-foreground">
            Вы записаны на{" "}
            <Link
              href={`/practice?session=${current.session.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {fmtDateTime(current.session.startsAt, tz)}
            </Link>
            {current.session.location ? ` · ${current.session.location}` : ""}
          </span>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Когда сдаёте?</DialogTitle>
            <DialogDescription>
              Выберите пару, на которую принесёте эту лабу. Нажмите ещё раз,
              чтобы убрать её из записи.
            </DialogDescription>
          </DialogHeader>
          {sessions === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ближайших сдач по этому предмету пока нет.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {sessions.map((s) => {
                const has = s.myLabIds.includes(labId);
                const blocked = s.full && s.myLabIds.length === 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={busy !== null || blocked}
                      onClick={() => choose(s)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                        has && "border-emerald-500/50 bg-emerald-500/8",
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-medium first-letter:uppercase">
                          {fmtWeekdayDate(s.startsAt, tz)}
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon className="size-3" aria-hidden />
                            {fmtTime(s.startsAt, tz)}
                            {s.endsAt ? `–${fmtTime(s.endsAt, tz)}` : ""}
                          </span>
                          {s.location ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPinIcon className="size-3" aria-hidden />
                              {s.location}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-1">
                            <UsersRoundIcon className="size-3" aria-hidden />
                            {s.capacity != null
                              ? `${s.signupsCount} из ${s.capacity}`
                              : s.signupsCount}
                          </span>
                        </div>
                      </div>
                      {busy === s.id ? (
                        <Spinner className="size-4" />
                      ) : has ? (
                        <CheckCircle2Icon
                          className="size-5 text-emerald-600"
                          aria-hidden
                        />
                      ) : blocked ? (
                        <span className="text-xs text-destructive">
                          Мест нет
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Полный список сдач и участников —{" "}
            <Link
              href="/practice"
              className="font-medium text-primary hover:underline"
            >
              на странице «Сдачи»
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
