"use client";

import type { TelegramAuthData } from "@/lib/api/types";

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: { bot_id: string; request_access?: string; lang?: string },
          callback: (user: TelegramAuthData | false) => void,
        ) => void;
      };
    };
  }
}

const SCRIPT = "https://telegram.org/js/telegram-widget.js?22";
let loading: Promise<void> | null = null;

/** Loads the Telegram widget script once (without rendering its own button). */
export function loadTelegram(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Telegram?.Login) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        reject(new Error("Не удалось загрузить Telegram"));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** Thrown when the user closed the Telegram window without confirming. */
export class TelegramCancelled extends Error {
  constructor() {
    super("Вход через Telegram отменён");
    this.name = "TelegramCancelled";
  }
}

/** Opens the Telegram OAuth popup and resolves with the signed payload. */
export async function telegramAuth(botId: string): Promise<TelegramAuthData> {
  await loadTelegram();
  const login = window.Telegram?.Login;
  if (!login) throw new Error("Telegram недоступен");
  return new Promise((resolve, reject) => {
    login.auth(
      { bot_id: botId, request_access: "write", lang: "ru" },
      (user) => {
        if (!user) reject(new TelegramCancelled());
        else resolve(user);
      },
    );
  });
}
