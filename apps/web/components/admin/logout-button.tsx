"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { authApi } from "@/lib/api/admin";

export function LogoutButton({
  variant = "button",
}: {
  variant?: "button" | "menu";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await authApi.logout();
    } catch {
      toast.error("Не удалось выйти");
      setLoading(false);
      return;
    }
    router.replace("/admin/login");
    router.refresh();
  }

  if (variant === "menu") {
    return (
      <SidebarMenuButton tooltip="Выйти" onClick={logout} disabled={loading}>
        <LogOutIcon />
        <span>Выйти</span>
      </SidebarMenuButton>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={logout} disabled={loading}>
      <LogOutIcon data-icon="inline-start" />
      Выйти
    </Button>
  );
}
