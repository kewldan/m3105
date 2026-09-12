"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { useUser } from "@/components/site/user-provider";

/**
 * Personal "сдано" marks, stored on the server for the signed-in student.
 * Guests get an empty set and `signedIn: false`.
 */
export function useLabsDone() {
  const { me, setDone } = useUser();
  const done = useMemo(() => new Set(me?.completedLabIds ?? []), [me]);
  const signedIn = me !== null;

  const isDone = useCallback((id: number) => done.has(id), [done]);

  const toggle = useCallback(
    async (id: number) => {
      if (!signedIn) return;
      const next = !done.has(id);
      try {
        await setDone(id, next);
        toast.success(next ? "Лаба отмечена как сданная" : "Отметка снята");
      } catch {
        toast.error("Не удалось сохранить отметку");
      }
    },
    [done, setDone, signedIn],
  );

  return { done, isDone, toggle, signedIn, hydrated: true };
}
