"use client";

import { ArrowRightIcon, BookmarkIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SubjectIcon } from "@/components/site/subject-icon";
import { fmtRelative } from "@/lib/format";

import { type LastNote, readLastNote } from "./last-note";

/** Card with the last opened lecture (browser-local). Renders nothing until known. */
export function ContinueReading() {
  const [last, setLast] = useState<LastNote | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    setLast(readLastNote());
  }, []);

  if (!last) return null;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/notes/${last.subject}/${last.slug}`}
        className="group flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <SubjectIcon
          icon={last.subjectIcon}
          color={last.subjectColor}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <BookmarkIcon className="size-3.5" aria-hidden />
            Продолжить чтение
          </div>
          <div className="truncate text-sm font-medium">
            {last.number}. {last.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {last.subjectName} · открыто {fmtRelative(last.at)}
          </div>
        </div>
        <ArrowRightIcon
          className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </motion.div>
  );
}
