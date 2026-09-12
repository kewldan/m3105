"use client";

import {
  CalendarClockIcon,
  CheckIcon,
  ClipboardCheckIcon,
  FingerprintIcon,
  FlaskConicalIcon,
  KeyRoundIcon,
  LogOutIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/site/empty-state";
import { DoneToggle } from "@/components/site/labs/done-toggle";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { SubjectBadge } from "@/components/site/subject-badge";
import { UserAvatar } from "@/components/site/user-avatar";
import { useUser } from "@/components/site/user-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { Lab, MeResponse } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import {
  browserSupportsWebAuthn,
  PasskeyCancelled,
  registerPasskey,
} from "@/lib/auth/passkeys";
import {
  fmtDateShort,
  fmtDateTime,
  fmtDateYear,
  fmtTime,
  plural,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function message(err: unknown): string {
  if (err instanceof PasskeyCancelled) return err.message;
  if (err instanceof ApiError) return err.message;
  return "Что-то пошло не так";
}

function Card({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon: typeof KeyRoundIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Signed-in student's profile: name, passkeys, completed labs, signups. */
export function Profile({
  initial,
  labs,
  tz,
}: {
  initial: MeResponse;
  labs: Lab[];
  tz: string;
}) {
  const router = useRouter();
  const { me: ctxMe, setMe, refresh, logout, setDone } = useUser();
  const me = ctxMe ?? initial;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.user.name);
  const [saving, setSaving] = useState(false);
  const [webauthn, setWebauthn] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  useEffect(() => setWebauthn(browserSupportsWebAuthn()), []);

  const labsById = useMemo(() => new Map(labs.map((l) => [l.id, l])), [labs]);
  const completed = me.completedLabIds
    .map((id) => labsById.get(id))
    .filter((l): l is Lab => !!l);

  const saveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Имя от 2 символов");
      return;
    }
    setSaving(true);
    try {
      const next = await userApi.updateName(trimmed);
      setMe(next);
      setEditing(false);
      toast.success("Имя обновлено");
      router.refresh();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setSaving(false);
    }
  };

  const addPasskey = async () => {
    setAdding(true);
    try {
      const next = await registerPasskey({ label: label.trim() || "Пасскей" });
      setMe(next);
      setAddOpen(false);
      setLabel("");
      toast.success("Пасскей добавлен");
    } catch (err) {
      if (!(err instanceof PasskeyCancelled)) toast.error(message(err));
    } finally {
      setAdding(false);
    }
  };

  const removePasskey = async (id: string) => {
    setBusyId(id);
    try {
      const next = await userApi.deletePasskey(id);
      setMe(next);
      toast.success("Пасскей удалён");
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusyId(null);
    }
  };

  const cancelSignup = async (sessionId: number) => {
    setBusyId(sessionId);
    try {
      await userApi.practiceCancel(sessionId);
      await refresh();
      toast.success("Запись отменена");
      router.refresh();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusyId(null);
    }
  };

  const onLogout = async () => {
    await logout();
    toast.success("Вы вышли");
    router.push("/");
    router.refresh();
  };

  return (
    <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <StaggerItem className="lg:col-span-3">
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
          <UserAvatar
            name={me.user.name}
            photoUrl={me.user.photoUrl}
            size="lg"
            className="size-16 text-lg sm:size-20"
          />
          <div className="min-w-0 flex-1 space-y-1">
            {editing ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Имя"
                  maxLength={80}
                  className="max-w-xs text-base"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? (
                    <Spinner />
                  ) : (
                    <CheckIcon data-icon="inline-start" />
                  )}
                  Сохранить
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setName(me.user.name);
                  }}
                >
                  <XIcon data-icon="inline-start" />
                  Отмена
                </Button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {me.user.name}
                </h1>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Изменить имя"
                  onClick={() => setEditing(true)}
                >
                  <PencilIcon />
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {me.user.telegramUsername ? (
                <a
                  href={`https://t.me/${me.user.telegramUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                >
                  <SendIcon className="size-3.5" aria-hidden />@
                  {me.user.telegramUsername}
                </a>
              ) : null}
              <span>С нами с {fmtDateYear(me.user.createdAt, tz)}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={onLogout}
          >
            <LogOutIcon data-icon="inline-start" />
            Выйти
          </Button>
        </section>
      </StaggerItem>

      <StaggerItem className="lg:col-span-2">
        <Card
          title="Мои записи на сдачу"
          icon={ClipboardCheckIcon}
          action={
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/practice" />}
            >
              Все сдачи
            </Button>
          }
        >
          {me.signups.length === 0 ? (
            <EmptyState
              icon={CalendarClockIcon}
              title="Вы пока никуда не записаны"
              description="Отметьте сделанную лабу и выберите пару, на которой сдадите её."
              className="py-8"
              action={
                <Button size="sm" render={<Link href="/practice" />}>
                  Выбрать сдачу
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {me.signups.map((s) => (
                <li
                  key={s.session.id}
                  className="flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SubjectBadge
                        name={
                          s.session.subjectShortName || s.session.subjectName
                        }
                        color={s.session.subjectColor}
                        slug={s.session.subjectSlug}
                      />
                      <span className="text-sm font-medium first-letter:uppercase">
                        {fmtDateTime(s.session.startsAt, tz)}
                        {s.session.endsAt
                          ? `–${fmtTime(s.session.endsAt, tz)}`
                          : ""}
                      </span>
                      {s.session.location ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPinIcon className="size-3" aria-hidden />
                          {s.session.location}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.labs.map((l) => (
                        <Link
                          key={l.id}
                          href={`/labs/${l.subjectSlug}/${l.slug}`}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent"
                        >
                          Лаба {l.number} · {l.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <Link href={`/practice?session=${s.session.id}`} />
                      }
                    >
                      Изменить
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={busyId === s.session.id}
                          />
                        }
                      >
                        Отменить
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Отменить запись?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Место освободится для одногруппников. Записаться
                            снова можно в любой момент, пока есть места.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Оставить</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => cancelSignup(s.session.id)}
                          >
                            Отменить запись
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card
          title="Пасскеи"
          icon={KeyRoundIcon}
          action={
            webauthn ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(true)}
              >
                <PlusIcon data-icon="inline-start" />
                Добавить
              </Button>
            ) : null
          }
        >
          {me.passkeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-pretty">
              Пасскеев пока нет. Добавьте один, чтобы входить по Face ID, Touch
              ID или PIN устройства даже без Telegram.
            </p>
          ) : (
            <ul className="space-y-2">
              {me.passkeys.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                >
                  <FingerprintIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {p.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Создан {fmtDateShort(p.createdAt, tz)}
                      {p.lastUsedAt
                        ? ` · вход ${fmtDateShort(p.lastUsedAt, tz)}`
                        : ""}
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Удалить пасскей"
                          disabled={busyId === p.id}
                        />
                      }
                    >
                      <Trash2Icon />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить пасскей?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Войти этим ключом больше не получится. Аккаунт и
                          отметки останутся.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Оставить</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => removePasskey(p.id)}
                        >
                          Удалить
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
          {!webauthn ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Этот браузер не поддерживает пасскеи.
            </p>
          ) : null}
        </Card>
      </StaggerItem>

      <StaggerItem className="lg:col-span-3">
        <Card
          title={`Сданные лабы${completed.length ? ` · ${completed.length}` : ""}`}
          icon={FlaskConicalIcon}
          action={
            <Button variant="ghost" size="sm" render={<Link href="/labs" />}>
              Все лабы
            </Button>
          }
        >
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Отмечайте сданные лабы кружком в списке — здесь появится история.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {completed.map((lab) => (
                <li
                  key={lab.id}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
                >
                  <DoneToggle
                    checked
                    size="sm"
                    onToggle={() =>
                      setDone(lab.id, false).then(
                        () => toast.success("Отметка снята"),
                        () => toast.error("Не удалось снять отметку"),
                      )
                    }
                  />
                  <Link
                    href={`/labs/${lab.subjectSlug}/${lab.slug}`}
                    className="min-w-0 flex-1"
                  >
                    <div className="flex items-center gap-2">
                      <SubjectBadge
                        name={lab.subjectShortName || lab.subjectName}
                        color={lab.subjectColor}
                      />
                      <span className="text-xs text-muted-foreground">
                        Лаба {lab.number}
                      </span>
                    </div>
                    <div className="truncate text-sm font-medium">
                      {lab.title}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {completed.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {completed.length}{" "}
              {plural(completed.length, "лаба", "лабы", "лаб")} из {labs.length}
            </p>
          ) : null}
        </Card>
      </StaggerItem>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый пасскей</DialogTitle>
            <DialogDescription>
              Назовите устройство, чтобы потом отличать ключи друг от друга.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void addPasskey();
            }}
          >
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: MacBook или iPhone"
              aria-label="Название пасскея"
              maxLength={60}
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={adding}>
                {adding ? (
                  <Spinner />
                ) : (
                  <FingerprintIcon data-icon="inline-start" />
                )}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Stagger>
  );
}
