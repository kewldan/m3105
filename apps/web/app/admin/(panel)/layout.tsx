import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type React from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { ApiError, apiServer } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Админка", template: "%s — Админка М3105" },
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let state: "ok" | "unauthorized" | "unreachable" = "ok";
  try {
    await apiServer("/auth/me", { headers: { cookie: cookieHeader } });
  } catch (err) {
    state =
      err instanceof ApiError && err.status === 401
        ? "unauthorized"
        : "unreachable";
  }
  if (state === "unauthorized") redirect("/admin/login");
  if (state === "unreachable") {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-md space-y-2 rounded-xl border bg-card p-6 text-center">
          <div className="font-heading text-lg font-semibold">
            API недоступен
          </div>
          <p className="text-sm text-muted-foreground">
            Не удалось связаться с бэкендом. Проверьте, что сервис API запущен,
            и обновите страницу.
          </p>
        </div>
      </div>
    );
  }

  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return <AdminShell defaultOpen={sidebarOpen}>{children}</AdminShell>;
}
