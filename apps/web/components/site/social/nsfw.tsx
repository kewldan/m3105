"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "m3105:nsfw-confirmed";

// Подтверждение возраста живёт в браузере и общее для всех карточек ленты,
// поэтому маленькое внешнее хранилище вместо состояния внутри поста.
// Преграда шуточная: паспорт никто не спрашивает, сервер и так отдаёт 18+
// только вошедшим студентам.
let confirmed = false;
let loaded = false;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  if (!loaded) {
    loaded = true;
    confirmed = read();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: boolean) {
  confirmed = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Приватный режим: подтверждение живёт до перезагрузки.
  }
  emit();
}

/** Подтверждено ли, что читателю есть 18. На сервере всегда false. */
export function useAgeConfirmed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => confirmed,
    () => false,
  );
}

export const confirmAge = () => set(true);
export const hideNsfw = () => set(false);

/** Кнопка «спрятать обратно» для шапки ленты. */
export function NsfwToggle() {
  const ok = useAgeConfirmed();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => (ok ? hideNsfw() : confirmAge())}
      className="gap-1.5 text-muted-foreground"
    >
      {ok ? <EyeOffIcon /> : <EyeIcon />}
      {ok ? "Скрыть 18+" : "Показать 18+"}
    </Button>
  );
}
