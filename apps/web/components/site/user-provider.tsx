"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { MeResponse } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";

type UserContextValue = {
  /** Signed-in student bundle or null. */
  me: MeResponse | null;
  /** Replace the bundle (after login/logout or profile changes). */
  setMe: (me: MeResponse | null) => void;
  /** Re-fetch from the API. */
  refresh: () => Promise<MeResponse | null>;
  logout: () => Promise<void>;
  isDone: (labId: number) => boolean;
  /** Optimistically toggles a lab completion on the server. */
  setDone: (labId: number, done: boolean) => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
  initial,
  children,
}: {
  initial: MeResponse | null;
  children: ReactNode;
}) {
  const [me, setMeState] = useState<MeResponse | null>(initial);

  const setMe = useCallback((next: MeResponse | null) => setMeState(next), []);

  const refresh = useCallback(async () => {
    try {
      const next = await userApi.me();
      setMeState(next);
      return next;
    } catch {
      setMeState(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await userApi.logout();
    } finally {
      setMeState(null);
    }
  }, []);

  const isDone = useCallback(
    (labId: number) => me?.completedLabIds.includes(labId) ?? false,
    [me],
  );

  const setDone = useCallback(
    async (labId: number, done: boolean) => {
      if (!me) return;
      const previous = me.completedLabIds;
      const optimistic = done
        ? Array.from(new Set([...previous, labId]))
        : previous.filter((id) => id !== labId);
      setMeState({ ...me, completedLabIds: optimistic });
      try {
        const res = await userApi.setLabDone(labId, done);
        setMeState((cur) =>
          cur ? { ...cur, completedLabIds: res.completedLabIds } : cur,
        );
      } catch (err) {
        setMeState((cur) =>
          cur ? { ...cur, completedLabIds: previous } : cur,
        );
        throw err;
      }
    },
    [me],
  );

  const value = useMemo<UserContextValue>(
    () => ({ me, setMe, refresh, logout, isDone, setDone }),
    [me, setMe, refresh, logout, isDone, setDone],
  );
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/** Access the signed-in student. Must be used inside the site layout. */
export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}
