"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * Пункт чек-листа из MDX (`- [ ] …`). Отметки хранятся в браузере отдельно
 * для каждой страницы, ключ пункта — его текст (см. rehypeTaskList).
 */
const PREFIX = "edu3105:tasks:";
const EVENT = "edu3105:tasks";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function readRaw(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function parse(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t) => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

export function TaskCheckbox({
  task,
  defaultChecked,
}: {
  task: string;
  defaultChecked: boolean;
}) {
  const key = PREFIX + usePathname();
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => "",
  );
  // В хранилище лежат пункты, состояние которых отличается от исходного
  // в тексте, — так «[x]» в конспекте остаётся отмеченным по умолчанию.
  const toggled = parse(raw).includes(task);
  const checked = toggled !== defaultChecked;

  function setChecked(next: boolean) {
    const rest = parse(readRaw(key)).filter((t) => t !== task);
    const all = next === defaultChecked ? rest : [...rest, task];
    try {
      if (all.length) window.localStorage.setItem(key, JSON.stringify(all));
      else window.localStorage.removeItem(key);
    } catch {
      // Приватный режим или запрет хранилища — отметка не запомнится.
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={setChecked}
      aria-label={task}
      className="mt-[0.3em] cursor-pointer"
    />
  );
}
