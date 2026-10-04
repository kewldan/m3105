"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CopyIcon,
  GripVerticalIcon,
  ShuffleIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/admin/user-avatar";
import { GroupBadge } from "@/components/site/group-badge";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { PracticeSession, QueueEntry } from "@/lib/api/types";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function sessionLabel(s: PracticeSession): string {
  const range = s.endsAt
    ? `${fmtDateTime(s.startsAt)} — ${fmtTime(s.endsAt)}`
    : fmtDateTime(s.startsAt);
  return `${s.subjectShortName || s.subjectName} · ${range}${s.location ? ` · ${s.location}` : ""}`;
}

const entryId = (e: QueueEntry) => `${e.user.id}:${e.lab.id}`;

function QueueRow({
  entry: e,
  index,
  disabled,
}: {
  entry: QueueEntry;
  index: number;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entryId(e), disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative flex items-start gap-2 bg-background px-3 py-2.5",
        isDragging && "z-10 rounded-lg shadow-lg ring-1 ring-border",
        e.reserve && "bg-muted/40",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        disabled={disabled}
        aria-label={`Переместить: ${e.user.name}, лаба ${e.lab.number}`}
        className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-50"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      <span className="w-5 pt-1.5 text-right text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <UserAvatar
        name={e.user.name}
        photoUrl={e.user.photoUrl}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{e.user.name}</span>
          <GroupBadge group={e.user.group} />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="secondary" className="font-normal">
            Лаба {e.lab.number} · {e.lab.title}
          </Badge>
          {e.reserve ? <Badge variant="outline">резерв</Badge> : null}
          {e.carried ? (
            <Badge variant="outline">
              перенос{e.missed > 1 ? ` ×${e.missed}` : ""}
            </Badge>
          ) : null}
          {e.late ? <Badge variant="outline">поздняя</Badge> : null}
        </div>
      </div>
    </li>
  );
}

/** Who signed up for a practice session and which labs they bring. */
export function ParticipantsDialog({
  session,
  onOpenChange,
}: {
  session: PracticeSession | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = session !== null;
  const sessionId = session?.id ?? 0;
  const { data, loading, error } = useQuery(
    () =>
      sessionId > 0
        ? adminApi.practice.signups(sessionId)
        : Promise.resolve(null),
    String(sessionId),
  );

  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [manual, setManual] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEntries(data?.queue ?? []);
    setManual(data?.queueManual ?? false);
  }, [data]);

  async function resetAuto() {
    if (sessionId <= 0) return;
    setSaving(true);
    try {
      const res = await adminApi.practice.autoQueue(sessionId);
      setEntries(res.queue);
      setManual(res.queueManual);
      toast.success("Очередь пересчитана");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Не удалось пересчитать очередь",
      );
    } finally {
      setSaving(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || sessionId <= 0) return;
    const from = entries.findIndex((e) => entryId(e) === active.id);
    const to = entries.findIndex((e) => entryId(e) === over.id);
    if (from < 0 || to < 0) return;
    const previous = entries;
    const next = arrayMove(entries, from, to);
    setEntries(next);
    setSaving(true);
    try {
      const res = await adminApi.practice.reorder(
        sessionId,
        next.map((e) => ({ userId: e.user.id, labId: e.lab.id })),
      );
      setEntries(res.queue);
      setManual(res.queueManual);
    } catch (e) {
      setEntries(previous);
      toast.error(
        e instanceof Error ? e.message : "Не удалось сохранить очередь",
      );
    } finally {
      setSaving(false);
    }
  }
  const seats = session
    ? session.capacity != null
      ? `${entries.length} из ${session.capacity} защит`
      : `${entries.length} · без резерва`
    : "";

  async function copyList() {
    const lines = entries.map(
      (e, i) =>
        `${i + 1}. ${e.user.name}${e.user.group ? ` (${e.user.group})` : ""} — лаба ${e.lab.number}${e.reserve ? " (резерв)" : ""}`,
    );
    const header = session ? `${sessionLabel(session)}\n` : "";
    try {
      await navigator.clipboard.writeText(header + lines.join("\n"));
      toast.success("Список скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4 text-primary" aria-hidden />
            Участники
          </DialogTitle>
          {session ? (
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <SubjectBadge
                name={session.subjectShortName || session.subjectName}
                color={session.subjectColor}
              />
              <span>
                {fmtDateTime(session.startsAt)}
                {session.endsAt ? ` — ${fmtTime(session.endsAt)}` : ""}
              </span>
              {session.location ? <span>· {session.location}</span> : null}
              <span>· {seats}</span>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">
            Не удалось загрузить список: {error.message}
          </p>
        ) : loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : entries.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>Пока никто не записался</EmptyTitle>
              <EmptyDescription>
                Студенты записываются на сдачу со страницы лабы или раздела
                «Сдачи» на сайте.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={entries.map(entryId)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="max-h-[60dvh] divide-y overflow-y-auto rounded-xl border">
                  {entries.map((e, i) => (
                    <QueueRow
                      key={entryId(e)}
                      entry={e}
                      index={i}
                      disabled={saving}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {entries.length > 1 ? (
              manual ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Порядок задан вручную, новые записи встают в конец.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={resetAuto}
                  >
                    <ShuffleIcon data-icon="inline-start" />
                    Автоматически
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {data?.frozen
                    ? "Порядок заморожен, новые записи встают в конец."
                    : `До ${fmtDateTime(data?.freezesAt ?? "")} порядок пересчитывается при каждой записи.`}{" "}
                  Перетащите за ручку, чтобы задать порядок вручную.
                </p>
              )
            ) : null}
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={copyList}
            disabled={entries.length === 0}
          >
            <CopyIcon data-icon="inline-start" />
            Скопировать список
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
