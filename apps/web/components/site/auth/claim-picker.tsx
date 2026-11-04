"use client";

import {
  SearchIcon,
  UserRoundCheckIcon,
  UserRoundSearchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { GroupBadge } from "@/components/site/group-badge";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { StudentChoice } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { plural } from "@/lib/format";
import { normalizeGroup } from "@/lib/group";
import { cn } from "@/lib/utils";

const ALL = "all";

/** "ё" and "е" match each other, case does not matter. */
function fold(s: string): string {
  return s.toLowerCase().replaceAll("ё", "е");
}

/**
 * The step that confirms a new account: the student finds themselves in the
 * course list. People someone already picked are not offered. The choice is
 * final — name, group and ISU number come from the list.
 */
export function ClaimPicker({
  siteGroup,
  className,
}: {
  /** Group selected at first; the whole list when it is not in it. */
  siteGroup: string;
  className?: string;
}) {
  const router = useRouter();
  const { setMe } = useUser();
  const [list, setList] = useState<StudentChoice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StudentChoice | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setFailed(false);
    userApi
      .students()
      .then(setList)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);

  const groups = useMemo(
    () => [...new Set((list ?? []).map((s) => s.groupName))].sort(),
    [list],
  );
  const preferred =
    groups.find((g) => normalizeGroup(g) === normalizeGroup(siteGroup)) ?? ALL;
  const current = group ?? preferred;
  const options = useMemo(
    () => [
      { value: ALL, label: "Все группы" },
      ...groups.map((g) => ({ value: g, label: g })),
    ],
    [groups],
  );

  const words = fold(query).split(/\s+/).filter(Boolean);
  // Searching by name looks through every group: people often mistype theirs.
  const shown = (list ?? []).filter((s) => {
    if (words.length > 0) {
      const name = fold(s.fullName);
      return words.every((w) => name.includes(w));
    }
    return current === ALL || s.groupName === current;
  });

  const claim = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const me = await userApi.claim(picked.id);
      setMe(me);
      setPicked(null);
      toast.success(`Готово, ${me.user.name}!`, {
        description: "Аккаунт подтверждён, всё на сайте открыто.",
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не получилось");
      setPicked(null);
      if (err instanceof ApiError && err.code === "student_taken") load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className={cn(
        "space-y-4 rounded-2xl border border-amber-500/40 bg-amber-500/6 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex gap-3">
        <UserRoundSearchIcon
          className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="space-y-1 text-sm">
          <h2 className="font-semibold">Найдите себя в списке студентов</h2>
          <p className="text-muted-foreground text-pretty">
            Так подтверждается аккаунт: после выбора откроются запись на сдачи,
            отметки о лабах, комментарии и баллы. Имя и группа возьмутся из
            списка, поменять их потом можно только через администратора, так что
            выбирайте внимательно.
          </p>
        </div>
      </div>

      {failed ? (
        <p className="text-sm text-destructive">
          Не удалось загрузить список.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={load}
          >
            Повторить
          </button>
        </p>
      ) : list === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Список студентов ещё не загружен. Напишите администратору или в чат
          группы.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Фамилия или имя"
                aria-label="Поиск по фамилии"
                className="pl-8"
                autoComplete="off"
              />
            </div>
            <Select
              value={current}
              onValueChange={(v) => setGroup((v as string | null) ?? ALL)}
              items={options}
            >
              <SelectTrigger
                className="sm:min-w-40"
                aria-label="Группа"
                disabled={words.length > 0}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted-foreground">
              {words.length > 0
                ? "Никого не нашли. Проверьте фамилию: возможно, вас уже выбрал кто-то другой — тогда напишите администратору."
                : "В этой группе выбирать уже некого."}
            </p>
          ) : (
            <ul
              className="max-h-80 divide-y overflow-y-auto rounded-xl border bg-background"
              aria-label="Студенты"
            >
              {shown.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(s)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {s.fullName}
                    </span>
                    <GroupBadge group={s.groupName} />
                    <span className="hidden w-14 text-right text-xs text-muted-foreground tabular-nums sm:inline">
                      {s.groupName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {shown.length}{" "}
            {plural(shown.length, "студент", "студента", "студентов")} · Нет
            себя в списке — напишите администратору.
          </p>
        </>
      )}

      <AlertDialog
        open={picked !== null}
        onOpenChange={(o) => {
          if (!o && !saving) setPicked(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Это вы?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {picked?.fullName}
              </span>
              , группа {picked?.groupName}. На сайте вас будут видеть под этим
              именем, а изменить выбор сможет только администратор.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Нет, назад</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void claim();
              }}
            >
              {saving ? <Spinner /> : <UserRoundCheckIcon />}
              Да, это я
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
