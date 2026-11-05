"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { StaffMe } from "@/lib/api/types";

const StaffContext = createContext<StaffMe>({
  authenticated: true,
  role: "admin",
});

/** Who works in the admin panel: the admin or an editor with a zone. */
export function StaffProvider({
  value,
  children,
}: {
  value: StaffMe;
  children: ReactNode;
}) {
  return (
    <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
  );
}

export function useStaff(): StaffMe & {
  isAdmin: boolean;
  zone: string[];
  /** Whether content with this audience is the viewer's to edit. */
  covers: (audience: string[]) => boolean;
} {
  const me = useContext(StaffContext);
  const isAdmin = me.role === "admin";
  const zone = me.editor?.zone ?? [];
  return {
    ...me,
    isAdmin,
    zone,
    covers: (a) =>
      isAdmin || (a.length > 0 && a.every((t) => zone.includes(t))),
  };
}
