"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import type { Note } from "@/lib/api/types";

import { writeLastNote } from "./last-note";
import {
  measure,
  offsetOf,
  readPosition,
  writePosition,
} from "./reading-position";

/** How long after opening the place is re-aligned while the page settles. */
const SETTLE_MS = 3000;
/** Scrolled further than this, the page is already where the reader wants. */
const MOVED_PX = 200;
/** Pause after the last scroll event before the place is written down. */
const SAVE_DELAY_MS = 250;

/**
 * Remembers the opened lecture and the place in it: the library offers
 * «Продолжить чтение», and the lecture itself reopens where the reader
 * stopped. The text is the element marked `data-note-body`.
 */
export function RememberNote({ note }: { note: Note }) {
  const {
    subjectSlug,
    subjectColor,
    subjectIcon,
    slug,
    title,
    number: num,
  } = note;
  const subjectName = note.subjectShortName || note.subjectName;

  useEffect(() => {
    const key = `${subjectSlug}/${slug}`;
    const remember = (progress: number) =>
      writeLastNote({
        subject: subjectSlug,
        subjectName,
        subjectColor,
        subjectIcon,
        slug,
        title,
        number: num,
        progress,
        at: new Date().toISOString(),
      });

    const saved = readPosition(key);
    remember(saved?.progress ?? 0);
    const body = document.querySelector<HTMLElement>("[data-note-body]");
    if (!body) return;

    // Картинки и шрифты догружаются и сдвигают текст: пока читатель сам не
    // тронул страницу, место подравнивается под новую вёрстку.
    let settleUntil = 0;
    const jump = () => {
      if (!saved) return;
      window.scrollTo({ top: offsetOf(body, saved), behavior: "instant" });
    };
    // Ссылка на раздел важнее сохранённого места. Страница уже прокручена —
    // вернулись кнопкой «Назад» или читатель начал листать, не дождавшись
    // загрузки: тогда её не трогаем.
    if (saved && !window.location.hash && window.scrollY < MOVED_PX) {
      jump();
      settleUntil = Date.now() + SETTLE_MS;
      toast("Вернули туда, где вы остановились", {
        id: "note-position",
        duration: 6000,
        action: {
          label: "В начало",
          onClick: () => {
            settleUntil = 0;
            // Мгновенно: плавная прокрутка через весь конспект шла бы секунды.
            window.scrollTo({ top: 0, behavior: "instant" });
            writePosition(key, null);
          },
        },
      });
    }

    const stopSettling = () => {
      settleUntil = 0;
    };
    const resized = new ResizeObserver(() => {
      if (Date.now() < settleUntil) jump();
    });
    resized.observe(body);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      timer = undefined;
      if (!body.isConnected) return;
      const { position, progress } = measure(body);
      writePosition(key, position);
      remember(progress);
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    };
    // Вкладку закрыли или свернули сразу после прокрутки — таймер не успеет.
    const flush = () => {
      if (timer !== undefined) save();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    const passive = { passive: true } as const;
    window.addEventListener("scroll", onScroll, passive);
    window.addEventListener("wheel", stopSettling, passive);
    window.addEventListener("touchstart", stopSettling, passive);
    window.addEventListener("keydown", stopSettling);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      flush();
      resized.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", stopSettling);
      window.removeEventListener("touchstart", stopSettling);
      window.removeEventListener("keydown", stopSettling);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [subjectSlug, subjectName, subjectColor, subjectIcon, slug, title, num]);

  return null;
}
