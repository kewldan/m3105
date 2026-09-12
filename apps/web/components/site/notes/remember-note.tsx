"use client";

import { useEffect } from "react";

import type { Note } from "@/lib/api/types";

import { writeLastNote } from "./last-note";

/** Stores the opened lecture so the library can offer «Продолжить чтение». */
export function RememberNote({ note }: { note: Note }) {
  useEffect(() => {
    writeLastNote({
      subject: note.subjectSlug,
      subjectName: note.subjectShortName || note.subjectName,
      subjectColor: note.subjectColor,
      subjectIcon: note.subjectIcon,
      slug: note.slug,
      title: note.title,
      number: note.number,
      at: new Date().toISOString(),
    });
  }, [note]);
  return null;
}
