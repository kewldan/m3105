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
import { CopyIcon, GripVerticalIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/admin/user-avatar";
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
import type { Participant, PracticeSession } from "@/lib/api/types";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function sessionLabel(s: PracticeSession): string {
  const range = s.endsAt
    ? `${fmtDateTime(s.startsAt)} — ${fmtTime(s.endsAt)}`
    : fmtDateTime(s.startsAt);
  return `${s.subjectShortName || s.subjectName} · ${range}${s.location ? ` · ${s.location}` : ""}`;
}

function QueueRow({
  participant: p,
  index,
  disabled,
}: {
  participant: Participant;
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
  } = useSortable({ id: p.user.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative flex items-start gap-2 bg-background px-3 py-2.5",
        isDragging && "z-10 rounded-lg shadow-lg ring-1 ring-border",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        disabled={disabled}
        aria-label={`Переместить: ${p.user.name}`}
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
        name={p.user.name}
        photoUrl={p.user.photoUrl}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.user.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {p.labs.map((l) => (
            <Badge key={l.id} variant="secondary" className="font-normal">
              Лаба {l.number} · {l.title}
            </Badge>
          ))}
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

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setParticipants(data?.participants ?? []);
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || sessionId <= 0) return;
    const from = participants.findIndex((p) => p.user.id === active.id);
    const to = participants.findIndex((p) => p.user.id === over.id);
    if (from < 0 || to < 0) return;
    const previous = participants;
    const next = arrayMove(participants, from, to);
    setParticipants(next);
    setSaving(true);
    try {
      const res = await adminApi.practice.reorder(
        sessionId,
        next.map((p) => p.user.id),
      );
      setParticipants(res.participants);
    } catch (e) {
      setParticipants(previous);
      toast.error(
        e instanceof Error ? e.message : "Не удалось сохранить очередь",
      );
    } finally {
      setSaving(false);
    }
  }
  const seats = session
    ? session.capacity != null
      ? `${participants.length} из ${session.capacity}`
      : `${participants.length} · без лимита`
    : "";

  async function copyList() {
    const lines = participants.map(
      (p) =>
        `${p.user.name} — ${p.labs.map((l) => `Лаба ${l.number}`).join(", ")}`,
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
        ) : participants.length === 0 ? (
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
                items={participants.map((p) => p.user.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="max-h-[60dvh] divide-y overflow-y-auto rounded-xl border">
                  {participants.map((p, i) => (
                    <QueueRow
                      key={p.user.id}
                      participant={p}
                      index={i}
                      disabled={saving}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {participants.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Очередь по времени записи; перетащите за ручку, чтобы изменить
                порядок сдачи.
              </p>
            ) : null}
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={copyList}
            disabled={participants.length === 0}
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
