"use client";

import {
  FlameIcon,
  LaughIcon,
  LockIcon,
  PlusIcon,
  UtensilsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  isPending,
  PendingNotice,
} from "@/components/site/auth/pending-notice";
import { EmptyState } from "@/components/site/empty-state";
import { socialErrorMessage } from "@/components/site/social/comments-section";
import { NsfwToggle } from "@/components/site/social/nsfw";
import { PostCard } from "@/components/site/social/post-card";
import { PostDialog } from "@/components/site/social/post-dialog";
import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Post, PostKind, PostSort } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";

const COPY: Record<
  PostKind,
  { add: string; emptyTitle: string; emptyText: string; guestHint?: string }
> = {
  shawarma: {
    add: "Добавить точку",
    emptyTitle: "Пока ни одной точки",
    emptyText:
      "Расскажите, где рядом с универом кормят вкусно, а где лучше не рисковать.",
  },
  joke: {
    add: "Рассказать анекдот",
    emptyTitle: "Анекдотов пока нет",
    emptyText: "Будьте первым, кто рассмешит группу.",
    guestHint:
      "Часть анекдотов спрятана: «только для своих» и 18+ показываем тем, кто вошёл через Telegram.",
  },
};

/** Sortable feed of user posts with create / edit / delete for the author. */
export function PostFeed({
  kind,
  initial,
}: {
  kind: PostKind;
  initial: Post[];
}) {
  const { me } = useUser();
  const pathname = usePathname();
  const [posts, setPosts] = useState<Post[]>(initial);
  const [sort, setSort] = useState<PostSort>("new");
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; post: Post | null }>({
    open: false,
    post: null,
  });
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const copy = COPY[kind];
  const EmptyIcon = kind === "shawarma" ? UtensilsIcon : LaughIcon;

  const changeSort = async (next: PostSort) => {
    setSort(next);
    setLoading(true);
    try {
      setPosts(await userApi.posts(kind, next));
    } catch {
      toast.error("Не удалось загрузить ленту");
    } finally {
      setLoading(false);
    }
  };

  const replace = (next: Post) =>
    setPosts((list) => list.map((p) => (p.id === next.id ? next : p)));

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await userApi.deletePost(deleting.id);
      setPosts((list) => list.filter((p) => p.id !== deleting.id));
      toast.success("Пост удалён");
      setDeleting(null);
    } catch (err) {
      toast.error(socialErrorMessage(err, "Не удалось удалить пост"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const addButton = isPending(me) ? (
    <PendingNotice compact />
  ) : me ? (
    <Button onClick={() => setDialog({ open: true, post: null })}>
      <PlusIcon data-icon="inline-start" />
      {copy.add}
    </Button>
  ) : (
    <Button
      variant="outline"
      render={<Link href={`/login?next=${encodeURIComponent(pathname)}`} />}
    >
      Войти, чтобы написать
    </Button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={sort} onValueChange={(v) => changeSort(v as PostSort)}>
          <TabsList>
            <TabsTrigger value="new">Новые</TabsTrigger>
            <TabsTrigger value="top" className="gap-1">
              <FlameIcon className="size-3.5" aria-hidden />
              Лучшие
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          {posts.some((p) => p.nsfw) ? <NsfwToggle /> : null}
          {addButton}
        </div>
      </div>

      {!me && copy.guestHint ? (
        <p className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <LockIcon className="size-3.5 shrink-0" aria-hidden />
          {copy.guestHint}
          <Link
            href={`/login?next=${encodeURIComponent(pathname)}`}
            className="font-medium text-primary hover:underline"
          >
            Войти
          </Link>
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Загружаем…
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={EmptyIcon}
          title={copy.emptyTitle}
          description={copy.emptyText}
          action={me ? null : addButton}
        />
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onChange={replace}
              onEdit={() => setDialog({ open: true, post: p })}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <PostDialog
        kind={kind}
        post={dialog.post}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSave={(input) =>
          dialog.post
            ? userApi.updatePost(dialog.post.id, input)
            : userApi.createPost(input)
        }
        onSaved={(saved) => {
          if (dialog.post) replace(saved);
          else setPosts((list) => [saved, ...list]);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Удалить пост?"
        description="Вместе с ним удалятся лайки и комментарии. Отменить будет нельзя."
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
