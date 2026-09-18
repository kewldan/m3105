"use client";

import { MessageCircleIcon, SendIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AttachmentGallery } from "@/components/site/attachments/gallery";
import {
  AttachButton,
  AttachmentTray,
  STUDENT_ACCEPT,
  useAttachments,
  useFileDrop,
} from "@/components/site/attachments/picker";
import {
  isPending,
  PendingNotice,
} from "@/components/site/auth/pending-notice";
import { UserAvatar } from "@/components/site/user-avatar";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import type { Comment, CommentTarget } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { fmtRelative, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Human-readable message for a failed social request. */
export function socialErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Войдите, чтобы продолжить";
    if (err.status === 403) return err.message;
    const first = Object.values(err.fields).find(Boolean);
    return first ?? err.message ?? fallback;
  }
  return fallback;
}

/**
 * Comment thread under a note, lab or post. Pass `initial` when the server
 * already fetched the comments; otherwise they load on mount.
 */
export function CommentsSection({
  target,
  targetId,
  initial,
  compact = false,
  onCountChange,
  className,
}: {
  target: CommentTarget;
  targetId: number;
  initial?: Comment[];
  /** Tighter layout for threads inside a post card. */
  compact?: boolean;
  onCountChange?: (count: number) => void;
  className?: string;
}) {
  const { me } = useUser();
  const pathname = usePathname();
  const [comments, setComments] = useState<Comment[] | null>(initial ?? null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const files = useAttachments();
  const { dragging, dropProps } = useFileDrop(files.add);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    userApi
      .comments(target, targetId)
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, target, targetId]);

  const update = (next: Comment[]) => {
    setComments(next);
    onCountChange?.(next.length);
  };

  const canSend =
    (body.trim() !== "" || files.ids.length > 0) && !files.uploading;

  const submit = async () => {
    if (!canSend || sending) return;
    setSending(true);
    try {
      const created = await userApi.addComment(
        target,
        targetId,
        body.trim(),
        files.ids,
      );
      update([...(comments ?? []), created]);
      setBody("");
      files.reset();
    } catch (err) {
      toast.error(socialErrorMessage(err, "Не удалось отправить комментарий"));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await userApi.deleteComment(id);
      update((comments ?? []).filter((c) => c.id !== id));
      setConfirmId(null);
      toast.success("Комментарий удалён");
    } catch (err) {
      toast.error(socialErrorMessage(err, "Не удалось удалить комментарий"));
    }
  };

  const count = comments?.length ?? 0;
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  return (
    <section
      id={compact ? undefined : "comments"}
      className={cn(
        "scroll-mt-24",
        compact ? "space-y-3" : "space-y-4",
        className,
      )}
      aria-label="Комментарии"
    >
      {compact ? null : (
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <MessageCircleIcon className="size-5 text-primary" aria-hidden />
          Комментарии
          {comments ? (
            <span className="text-base font-normal text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
      )}

      {comments === null ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Загружаем…
        </div>
      ) : comments.length === 0 ? (
        <p
          className={cn(
            "text-muted-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {me
            ? "Пока пусто. Напишите первым."
            : "Пока никто ничего не написал."}
        </p>
      ) : (
        <ul className={compact ? "space-y-3" : "space-y-4"}>
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <UserAvatar
                name={c.authorName}
                photoUrl={c.authorPhotoUrl}
                size="sm"
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-medium text-foreground">
                    {c.authorName}
                  </span>
                  <span
                    className="text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {fmtRelative(c.createdAt)}
                  </span>
                  {c.mine ? (
                    confirmId === c.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          className="font-medium text-destructive hover:underline"
                        >
                          Точно удалить
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="text-muted-foreground hover:underline"
                        >
                          Отмена
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(c.id)}
                        aria-label="Удалить комментарий"
                        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2Icon className="size-3" aria-hidden />
                        Удалить
                      </button>
                    )
                  ) : null}
                </div>
                {c.body ? (
                  <p
                    className={cn(
                      "mt-0.5 break-words whitespace-pre-wrap",
                      compact ? "text-sm" : "text-[15px] leading-relaxed",
                    )}
                  >
                    {c.body}
                  </p>
                ) : null}
                <AttachmentGallery
                  items={c.attachments}
                  compact={compact}
                  className="mt-2"
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {isPending(me) ? (
        <PendingNotice compact />
      ) : me ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className={cn(
            "flex gap-3 rounded-xl transition-colors",
            dragging && "bg-primary/5 ring-2 ring-primary/40 ring-offset-4",
          )}
          {...dropProps}
        >
          <UserAvatar
            name={me.user.name}
            photoUrl={me.user.photoUrl}
            size="sm"
            className="mt-1 hidden shrink-0 sm:block"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              onPaste={files.onPaste}
              placeholder={
                compact ? "Ответить…" : "Вопрос, дополнение или благодарность…"
              }
              maxLength={2000}
              rows={compact ? 2 : 3}
              className={compact ? "min-h-12 text-sm" : undefined}
              aria-label="Текст комментария"
            />
            <AttachmentTray state={files} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1">
                <AttachButton
                  state={files}
                  accept={STUDENT_ACCEPT}
                  label={compact ? "" : "Фото или файл"}
                  className={compact ? "px-2" : "-ml-2"}
                />
                <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                  {body.length > 1800 ? `${body.length} / 2000 · ` : ""}
                  Ctrl+Enter — отправить
                </span>
              </div>
              <Button
                type="submit"
                size={compact ? "sm" : "default"}
                disabled={!canSend || sending}
              >
                {sending ? <Spinner /> : <SendIcon data-icon="inline-start" />}
                Отправить
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <p
          className={cn(
            "text-muted-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          <Link
            href={loginHref}
            className="font-medium text-primary hover:underline"
          >
            Войдите
          </Link>
          , чтобы {count > 0 ? "ответить" : "оставить комментарий"}
          {count > 0
            ? ` · ${count} ${plural(count, "комментарий", "комментария", "комментариев")}`
            : ""}
        </p>
      )}
    </section>
  );
}
