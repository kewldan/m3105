"use client";

import { RefreshCwIcon, ServerCrashIcon } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/site/empty-state";
import { Button } from "@/components/ui/button";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-10">
      <EmptyState
        icon={ServerCrashIcon}
        title="Не удалось загрузить страницу"
        description="Сервер данных не ответил. Попробуйте обновить через минуту — обычно это быстро проходит."
        action={
          <Button onClick={() => reset()} variant="outline" className="mt-2">
            <RefreshCwIcon data-icon="inline-start" />
            Попробовать снова
          </Button>
        }
      />
    </div>
  );
}
