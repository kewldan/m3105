import { WifiOffIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Нет связи — М3105",
  description: "Страница недоступна офлайн.",
  robots: { index: false, follow: false },
};

/**
 * Показывается, когда связи нет, а нужной страницы ещё нет в кеше.
 * Страница простая и без запросов к API: она должна открываться всегда.
 */
export default function OfflinePage() {
  return (
    <div className="container-page flex min-h-dvh flex-col items-center justify-center gap-4 py-16 text-center">
      <WifiOffIcon className="size-10 text-muted-foreground" aria-hidden />
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Нет связи
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Эту страницу не успели сохранить. Конспекты, которые вы уже открывали,
          доступны и без интернета — попробуйте вернуться к ним.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href="/notes" />}>К конспектам</Button>
        <Button variant="outline" render={<Link href="/" />}>
          На главную
        </Button>
      </div>
    </div>
  );
}
