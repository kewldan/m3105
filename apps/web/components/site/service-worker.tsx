"use client";

import { useEffect } from "react";

/**
 * Регистрирует service worker (см. `public/sw.js`), чтобы прочитанные страницы
 * открывались офлайн. В разработке не включаем: мешает горячей перезагрузке.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Регистрация могла не пройти (приватный режим, отключённые куки) —
        // сайт от этого работать не перестаёт.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
