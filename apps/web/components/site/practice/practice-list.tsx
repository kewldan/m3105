"use client";

import { ClipboardCheckIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/site/empty-state";
import { SessionCard } from "@/components/site/practice/session-card";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type {
  PracticeListResponse,
  PracticeSessionView,
} from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { fmtWeekdayDate, toYmd } from "@/lib/format";

/** Sessions grouped by day with the «show past» toggle. */
export function PracticeList({
  initial,
  tz,
  highlightId,
}: {
  initial: PracticeListResponse;
  tz: string;
  highlightId: number | null;
}) {
  const reduce = useReducedMotion();
  const [sessions, setSessions] = useState<PracticeSessionView[]>(
    initial.sessions,
  );
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSessions(initial.sessions);
  }, [initial.sessions]);

  useEffect(() => {
    if (highlightId == null) return;
    const el = document.getElementById(`session-${highlightId}`);
    el?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  }, [highlightId, reduce]);

  const togglePast = async (value: boolean) => {
    setShowPast(value);
    setLoading(true);
    try {
      const res = await userApi.practiceList({ past: value });
      setSessions(res.sessions);
    } catch {
      toast.error("Не удалось загрузить сдачи");
    } finally {
      setLoading(false);
    }
  };

  const replace = (next: PracticeSessionView) =>
    setSessions((list) => list.map((s) => (s.id === next.id ? next : s)));

  const groups = useMemo(() => {
    const map = new Map<string, PracticeSessionView[]>();
    for (const s of sessions) {
      const key = toYmd(s.startsAt, tz);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sessions, tz]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Label className="flex items-center gap-2 text-sm">
          <Switch checked={showPast} onCheckedChange={togglePast} />
          Показать прошедшие
        </Label>
        {loading ? <Spinner className="size-4" /> : null}
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={ClipboardCheckIcon}
          title="Сдач пока не запланировано"
          description="Когда преподаватель назначит пару для приёма лаб, она появится здесь."
        />
      ) : (
        <div className="space-y-8">
          <AnimatePresence initial={false}>
            {groups.map(([day, list]) => (
              <motion.section
                key={day}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <h2 className="text-base font-semibold first-letter:uppercase">
                  {fmtWeekdayDate(list[0].startsAt, tz)}
                </h2>
                <div className="space-y-3">
                  {list.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      tz={tz}
                      highlighted={s.id === highlightId}
                      onChange={replace}
                    />
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
