"use client";

import { ArrowLeftRightIcon, SkipForwardIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { signupErrorMessage } from "@/components/site/practice/signup-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type {
  PracticeSessionView,
  PracticeSwap,
  QueueEntry,
} from "@/lib/api/types";
import { userApi } from "@/lib/api/user";

/** Place (1-based) and entry of a defense in the queue. */
function placeOf(session: PracticeSessionView, userId: number, labId: number) {
  const i = session.queue.findIndex(
    (e) => e.user.id === userId && e.lab.id === labId,
  );
  return { place: i + 1, entry: session.queue[i] as QueueEntry | undefined };
}

/** Runs a queue request with a toast on failure; returns whether it worked. */
function useQueueAction(onChange: (next: PracticeSessionView) => void) {
  const [busy, setBusy] = useState(false);
  const run = async (
    call: () => Promise<PracticeSessionView>,
    success?: string,
  ) => {
    setBusy(true);
    try {
      onChange(await call());
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(signupErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** «Пропустить всех»: the student's defenses go to the end of the frozen queue. */
export function SkipButton({
  session,
  meId,
  onChange,
}: {
  session: PracticeSessionView;
  meId: number;
  onChange: (next: PracticeSessionView) => void;
}) {
  const { busy, run } = useQueueAction(onChange);
  const [open, setOpen] = useState(false);
  const mine = session.queue.filter((e) => e.user.id === meId);
  const atEnd = session.queue
    .slice(session.queue.length - mine.length)
    .every((e) => e.user.id === meId);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={busy || atEnd}
            title={atEnd ? "Вы и так в конце очереди" : undefined}
          />
        }
      >
        <SkipForwardIcon data-icon="inline-start" />
        Пропустить всех
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Пропустить всех?</AlertDialogTitle>
          <AlertDialogDescription>
            {mine.length > 1 ? "Ваши защиты встанут" : "Ваша защита встанет"} в
            конец очереди — как если бы вы отписались и записались снова, только
            лабы останутся. Вернуть прежнее место не получится, а ждущие обмены
            отменятся.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Оставить место</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async () => {
              if (
                await run(
                  () => userApi.practiceSkip(session.id),
                  "Вы в конце очереди",
                )
              )
                setOpen(false);
            }}
          >
            {busy ? <Spinner /> : null}
            Пропустить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Menu on someone else's defense: offer one of mine in exchange. */
export function SwapMenu({
  session,
  entry,
  meId,
  onChange,
}: {
  session: PracticeSessionView;
  entry: QueueEntry;
  meId: number;
  onChange: (next: PracticeSessionView) => void;
}) {
  const { busy, run } = useQueueAction(onChange);
  const target = placeOf(session, entry.user.id, entry.lab.id).place;
  const mine = session.queue
    .map((e, i) => ({ e, place: i + 1 }))
    .filter(({ e }) => e.user.id === meId);
  const asked = (labId: number) =>
    session.swaps.some(
      (s) =>
        !s.incoming &&
        s.fromLabId === labId &&
        s.toUserId === entry.user.id &&
        s.toLabId === entry.lab.id,
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            aria-label={`Предложить обмен: ${entry.user.name}, место ${target}`}
            title="Поменяться местами"
          />
        }
      >
        <ArrowLeftRightIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Обмен с {entry.user.name} (место {target})
          </DropdownMenuLabel>
          {mine.map(({ e, place }) => (
            <DropdownMenuItem
              key={e.lab.id}
              disabled={asked(e.lab.id)}
              onClick={() =>
                run(
                  () =>
                    userApi.practiceRequestSwap(session.id, {
                      labId: e.lab.id,
                      withUserId: entry.user.id,
                      withLabId: entry.lab.id,
                    }),
                  "Запрос отправлен — ждём согласия",
                )
              }
            >
              Отдать место {place} (лаба №{e.lab.number})
              {asked(e.lab.id) ? " — ждём ответа" : ""}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SwapRow({
  session,
  swap,
  onChange,
}: {
  session: PracticeSessionView;
  swap: PracticeSwap;
  onChange: (next: PracticeSessionView) => void;
}) {
  const { busy, run } = useQueueAction(onChange);
  const from = placeOf(session, swap.fromUserId, swap.fromLabId);
  const to = placeOf(session, swap.toUserId, swap.toLabId);
  const other = swap.incoming ? from.entry : to.entry;
  const [mine, theirs] = swap.incoming ? [to, from] : [from, to];

  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center">
      <span className="min-w-0 flex-1 text-pretty">
        {swap.incoming ? (
          <>
            <span className="font-medium">{other?.user.name}</span> предлагает
            обмен: ваше место {mine.place} (№{mine.entry?.lab.number}) на{" "}
            {theirs.place}-е (№{theirs.entry?.lab.number})
          </>
        ) : (
          <>
            Обмен предложен:{" "}
            <span className="font-medium">{other?.user.name}</span> — ваше место{" "}
            {mine.place} (№{mine.entry?.lab.number}) за {theirs.place}-е, ждём
            ответа
          </>
        )}
      </span>
      <span className="flex shrink-0 gap-2">
        {swap.incoming ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () => userApi.practiceAcceptSwap(swap.id),
                "Поменялись местами",
              )
            }
          >
            Согласиться
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => run(() => userApi.practiceDeleteSwap(swap.id))}
        >
          {swap.incoming ? "Отказаться" : "Отозвать"}
        </Button>
      </span>
    </li>
  );
}

/** Pending swap requests the student sent or got. */
export function SwapRequests({
  session,
  onChange,
}: {
  session: PracticeSessionView;
  onChange: (next: PracticeSessionView) => void;
}) {
  if (session.swaps.length === 0) return null;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border border-sky-500/30 bg-sky-500/5">
      {session.swaps.map((s) => (
        <SwapRow key={s.id} session={session} swap={s} onChange={onChange} />
      ))}
    </ul>
  );
}
