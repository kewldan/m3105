"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Данные страницы старше этого перечитываются, когда на неё вернулись. */
const STALE_MS = 2 * 60_000;

/**
 * Телефон может неделю держать вкладку открытой и показать её без
 * перезагрузки — со старой очередью, баллами и дедлайнами. Когда страница
 * снова видна (вернулись на вкладку, в браузер, восстановили из bfcache)
 * и данным больше пары минут, тихо перечитываем серверные компоненты:
 * `router.refresh()` сохраняет набранный текст и открытые диалоги.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  const pathname = usePathname();
  /** Когда данные текущей страницы пришли с сервера. */
  const loadedAt = useRef(0);

  // Layout переживает клиентские переходы: новая страница — свежие данные.
  useEffect(() => {
    void pathname;
    loadedAt.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() - loadedAt.current < STALE_MS) return;
      loadedAt.current = Date.now();
      router.refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // Из bfcache страница возвращается целиком, вместе с loadedAt.
      if (e.persisted) check();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
