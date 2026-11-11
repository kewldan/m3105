"use client";

import { CheckCircle2Icon, ClipboardCheckIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { PracticeSessionView } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function signupErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Войдите, чтобы записаться";
    return (
      err.fields.labIds ??
      err.fields.theoryLabIds ??
      err.fields._ ??
      err.message
    );
  }
  return "Не удалось сохранить запись";
}

/** Toggles one id in a set, as a new set. */
function toggled(prev: Set<number>, id: number, on: boolean): Set<number> {
  const next = new Set(prev);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * Pick which labs to hand in at a session and, for subjects with a theory
 * min, which theory mins to come to; empty selection cancels the signup.
 */
export function SignupDialog({
  session,
  open,
  onOpenChange,
  onSaved,
  tz,
}: {
  session: PracticeSessionView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: PracticeSessionView) => void;
  tz: string;
}) {
  const { me, refresh } = useUser();
  const [selected, setSelected] = useState<Set<number>>(
    new Set(session.myLabIds),
  );
  const [theory, setTheory] = useState<Set<number>>(
    new Set(session.myTheoryLabIds),
  );
  const [saving, setSaving] = useState(false);
  const withTheory = session.theoryMin;

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(session.myLabIds));
    setTheory(new Set(session.myTheoryLabIds));
  }, [open, session.myLabIds, session.myTheoryLabIds]);

  const completed = useMemo(
    () => new Set(me?.completedLabIds ?? []),
    [me?.completedLabIds],
  );
  const labs = useMemo(() => {
    const list = [...session.availableLabs];
    list.sort((a, b) => {
      const ca = completed.has(a.id) ? 0 : 1;
      const cb = completed.has(b.id) ? 0 : 1;
      return ca - cb || a.number - b.number;
    });
    return list;
  }, [session.availableLabs, completed]);

  const hadSignup =
    session.myLabIds.length > 0 || session.myTheoryLabIds.length > 0;
  const nothingSelected = selected.size === 0 && theory.size === 0;

  const save = async () => {
    setSaving(true);
    try {
      const next = await userApi.practiceSignup(
        session.id,
        [...selected],
        withTheory ? [...theory] : undefined,
      );
      onSaved(next);
      await refresh();
      toast.success(
        nothingSelected
          ? "Запись отменена"
          : `Вы записаны на ${fmtDateTime(session.startsAt, tz)}`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(signupErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheckIcon className="size-4 text-primary" aria-hidden />
            {hadSignup ? "Изменить запись" : "Записаться на сдачу"}
          </DialogTitle>
          <DialogDescription>
            <span className="first-letter:uppercase">
              {fmtDateTime(session.startsAt, tz)}
            </span>
            {session.location ? ` · ${session.location}` : ""}.{" "}
            {withTheory
              ? "Отметьте, какие лабы защищаете и на какой теормин придёте. Теормин не занимает место в очереди: по отметкам видно, сколько нужно менторов."
              : "Отметьте лабы, которые принесёте."}
          </DialogDescription>
        </DialogHeader>
        {labs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            У этого предмета пока нет опубликованных лаб.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {labs.map((lab) => {
              const checked = selected.has(lab.id);
              const done = completed.has(lab.id);
              const doneBadge = done ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2Icon className="size-3" aria-hidden />
                  сдана
                </span>
              ) : null;
              if (!withTheory) {
                return (
                  <li key={lab.id}>
                    <label
                      htmlFor={`signup-lab-${lab.id}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors select-none hover:bg-accent/40",
                        checked && "border-primary/50 bg-primary/5",
                      )}
                    >
                      <Checkbox
                        id={`signup-lab-${lab.id}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelected((prev) => toggled(prev, lab.id, v))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        Лаба {lab.number} · {lab.title}
                      </span>
                      {doneBadge}
                    </label>
                  </li>
                );
              }
              const theoryChecked = theory.has(lab.id);
              return (
                <li
                  key={lab.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                    (checked || theoryChecked) &&
                      "border-primary/50 bg-primary/5",
                  )}
                >
                  <span className="flex min-w-0 flex-1 basis-40 items-center gap-2">
                    <span className="truncate font-medium">
                      Лаба {lab.number} · {lab.title}
                    </span>
                    {doneBadge}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <label
                      htmlFor={`signup-lab-${lab.id}`}
                      className="flex cursor-pointer items-center gap-1.5 text-xs select-none"
                    >
                      <Checkbox
                        id={`signup-lab-${lab.id}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelected((prev) => toggled(prev, lab.id, v))
                        }
                      />
                      Защита
                    </label>
                    <label
                      htmlFor={`signup-theory-${lab.id}`}
                      className="flex cursor-pointer items-center gap-1.5 text-xs select-none"
                    >
                      <Checkbox
                        id={`signup-theory-${lab.id}`}
                        checked={theoryChecked}
                        onCheckedChange={(v) =>
                          setTheory((prev) => toggled(prev, lab.id, v))
                        }
                      />
                      Теормин
                    </label>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
          <Button
            type="button"
            variant={nothingSelected && hadSignup ? "destructive" : "default"}
            disabled={
              saving || (nothingSelected && !hadSignup) || labs.length === 0
            }
            onClick={save}
          >
            {saving ? <Spinner /> : null}
            {nothingSelected && hadSignup
              ? "Отменить запись"
              : hadSignup
                ? "Сохранить"
                : "Записаться"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
