"use client";

import {
  HeartIcon,
  LockIcon,
  MapPinIcon,
  MessageCircleIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AttachmentGallery } from "@/components/site/attachments/gallery";
import {
  CommentsSection,
  socialErrorMessage,
} from "@/components/site/social/comments-section";
import { confirmAge, useAgeConfirmed } from "@/components/site/social/nsfw";
import { RatingStars } from "@/components/site/social/rating-stars";
import { UserAvatar } from "@/components/site/user-avatar";
import { useUser } from "@/components/site/user-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One post in a feed with like, comments, and the author's edit / delete. */
export function PostCard({
  post,
  onChange,
  onEdit,
  onDelete,
}: {
  post: Post;
  onChange: (next: Post) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { me } = useUser();
  const ageConfirmed = useAgeConfirmed();
  const [open, setOpen] = useState(false);
  const [liking, setLiking] = useState(false);
  // 18+ размывается, пока читатель не подтвердил возраст.
  const blurred = post.nsfw && !ageConfirmed;

  const toggleLike = async () => {
    if (!me) {
      toast.error("Войдите, чтобы ставить лайки");
      return;
    }
    if (!me.user.approved) {
      toast.error("Лайки откроются после подтверждения аккаунта");
      return;
    }
    if (liking) return;
    setLiking(true);
    const optimistic: Post = {
      ...post,
      liked: !post.liked,
      likesCount: post.likesCount + (post.liked ? -1 : 1),
    };
    onChange(optimistic);
    try {
      onChange(await userApi.likePost(post.id, !post.liked));
    } catch (err) {
      onChange(post);
      toast.error(socialErrorMessage(err, "Не удалось поставить лайк"));
    } finally {
      setLiking(false);
    }
  };

  const isShawarma = post.kind === "shawarma";

  const content = (
    <>
      {post.title ? (
        <h3 className="font-heading text-lg font-semibold tracking-tight text-balance break-words">
          {post.title}
        </h3>
      ) : null}
      {isShawarma && post.address ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="break-words">{post.address}</span>
        </p>
      ) : null}
      <p className="break-words whitespace-pre-wrap text-[15px] leading-relaxed">
        {post.body}
      </p>
      <AttachmentGallery items={post.attachments} className="pt-1" />
    </>
  );

  return (
    <article
      id={`post-${post.id}`}
      className="scroll-mt-24 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <header className="flex items-start gap-3">
        <UserAvatar
          name={post.authorName}
          photoUrl={post.authorPhotoUrl}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{post.authorName}</span>
            <span
              className="text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {fmtRelative(post.createdAt)}
              {post.updatedAt !== post.createdAt ? " · изменено" : ""}
            </span>
            {post.nsfw ? (
              <Badge variant="destructive" className="text-[11px]">
                18+
              </Badge>
            ) : null}
            {post.visibility === "members" ? (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <LockIcon className="size-3" aria-hidden />
                Только для своих
              </Badge>
            ) : null}
          </div>
          {isShawarma ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <RatingStars value={post.rating} />
              {post.price != null ? (
                <span className="text-sm font-medium tabular-nums">
                  {post.price} ₽
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {post.mine ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Редактировать"
              onClick={onEdit}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Удалить"
              className="hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          </div>
        ) : null}
      </header>

      <div className="mt-3">
        {blurred ? (
          <div className="relative overflow-hidden rounded-xl border border-dashed">
            <div
              aria-hidden
              className="pointer-events-none space-y-2 p-4 blur-[7px] select-none"
            >
              {content}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/50 p-4 text-center">
              <p className="text-sm font-medium">🔞 Тут непристойно</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {post.kind === "joke" ? "Анекдот" : "Пост"} с пометкой 18+.
                Откроется, когда подтвердите возраст — на слово верим.
              </p>
              <Button size="sm" onClick={confirmAge}>
                Мне есть 18
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">{content}</div>
        )}
      </div>

      <footer className="mt-3 flex items-center gap-1 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLike}
          aria-pressed={post.liked}
          aria-label={post.liked ? "Убрать лайк" : "Поставить лайк"}
          className={cn(
            "gap-1.5 tabular-nums",
            post.liked && "text-rose-600 dark:text-rose-400",
          )}
        >
          <HeartIcon
            className={cn(
              "transition-transform",
              post.liked && "fill-current",
              liking && "scale-110",
            )}
          />
          {post.likesCount}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="gap-1.5 tabular-nums"
        >
          <MessageCircleIcon />
          {post.commentsCount}
        </Button>
      </footer>

      {open && !blurred ? (
        <div className="mt-3 border-t pt-4">
          <CommentsSection
            target="post"
            targetId={post.id}
            compact
            onCountChange={(count) =>
              onChange({ ...post, commentsCount: count })
            }
          />
        </div>
      ) : null}
    </article>
  );
}
