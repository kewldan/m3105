"use client";

import { ClipboardCheckIcon, WifiOffIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { fmtDateTime, fmtWeekdayDate, toYmd } from "@/lib/format";

/** Как часто перечитывать очередь, пока страница открыта и видна. */
const REFRESH_MS = 60_000;
/**
 * Вернулись на вкладку, страница восстановилась из bfcache или появилась
 * сеть — перечитываем, если данным больше этого. Телефон может неделю держать
 * открытую вкладку и показать её без перезагрузки.
 */
const STALE_MS = 15_000;

/** Sessions grouped by day with the «show past» toggle. */
export function PracticeList({
  initial,
  renderedAt,
  tz,
  highlightId,
  forGroup,
}: {
  initial: PracticeListResponse;
  /** Когда сервер отрисовал страницу: по нему видно, что HTML устарел. */
  renderedAt: string;
  tz: string;
  highlightId: number | null;
  /** Viewer's group filter from the page, kept on client reloads. */
  forGroup: string;
}) {
  const reduce = useReducedMotion();
  const [sessions, setSessions] = useState<PracticeSessionView[]>(
    initial.sessions,
  );
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Время последних удачно полученных данных. */
  const [updatedAt, setUpdatedAt] = useState(() => Date.parse(renderedAt));
  /** Фоновое обновление не прошло: показываем, на какой момент данные. */
  const [stale, setStale] = useState(false);
  const updatedRef = useRef(updatedAt);
  /**
   * Растёт при любой своей правке списка (запись, переключатель прошедших):
   * фоновый ответ, запрошенный раньше, её не перетирает.
   */
  const version = useRef(0);

  useEffect(() => {
    setSessions(initial.sessions);
    const at = Date.parse(renderedAt);
    updatedRef.current = at;
    setUpdatedAt(at);
    setStale(false);
  }, [initial.sessions, renderedAt]);

  useEffect(() => {
    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      const started = version.current;
      try {
        const res = await userApi.practiceList({
          past: showPast,
          for: forGroup,
        });
        if (version.current !== started) return;
        setSessions(res.sessions);
        updatedRef.current = Date.now();
        setUpdatedAt(updatedRef.current);
        setStale(false);
      } catch {
        if (version.current === started) setStale(true);
      } finally {
        busy = false;
      }
    };
    const refreshIfOld = () => {
      if (Date.now() - updatedRef.current > STALE_MS) refresh();
    };

    // Страница могла прийти старой (вкладка, восстановленная браузером).
    refreshIfOld();
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refreshIfOld);
    window.addEventListener("pageshow", refreshIfOld);
    window.addEventListener("focus", refreshIfOld);
    window.addEventListener("online", refreshIfOld);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfOld);
      window.removeEventListener("pageshow", refreshIfOld);
      window.removeEventListener("focus", refreshIfOld);
      window.removeEventListener("online", refreshIfOld);
    };
  }, [showPast, forGroup]);

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
    const mine = ++version.current;
    try {
      const res = await userApi.practiceList({ past: value, for: forGroup });
      if (version.current !== mine) return;
      setSessions(res.sessions);
      updatedRef.current = Date.now();
      setUpdatedAt(updatedRef.current);
      setStale(false);
    } catch {
      toast.error("Не удалось загрузить сдачи");
    } finally {
      setLoading(false);
    }
  };

  const replace = (next: PracticeSessionView) => {
    version.current++;
    setSessions((list) => list.map((s) => (s.id === next.id ? next : s)));
  };

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

      {stale ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          <WifiOffIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            Не удалось обновить очередь — показаны данные на{" "}
            {fmtDateTime(new Date(updatedAt), tz)}. Обновится сама, когда
            появится связь.
          </span>
        </p>
      ) : null}

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
