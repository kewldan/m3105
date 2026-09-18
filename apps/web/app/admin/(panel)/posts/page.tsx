"use client";

import {
  ExternalLinkIcon,
  HeartIcon,
  LockIcon,
  MessageCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AttachmentThumbs } from "@/components/admin/attachment-thumbs";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { type Column, DataTable } from "@/components/admin/data-table";
import { PageTitle } from "@/components/admin/page-title";
import { RowActions } from "@/components/admin/row-actions";
import { UserAvatar } from "@/components/admin/user-avatar";
import { PostDialog } from "@/components/site/social/post-dialog";
import { RatingStars } from "@/components/site/social/rating-stars";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleApiError } from "@/lib/admin/errors";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";
import type { Post, PostKind } from "@/lib/api/types";
import { fmtRelative } from "@/lib/format";

type KindFilter = "all" | PostKind;

const KIND_LABEL: Record<PostKind, string> = {
  shawarma: "Шаверма",
  joke: "Анекдот",
};
const KIND_PATH: Record<PostKind, string> = {
  shawarma: "/shawarma",
  joke: "/jokes",
};

export default function PostsPage() {
  const [kind, setKind] = useState<KindFilter>("all");
  const { data, loading, reload } = useQuery(
    () => adminApi.posts.list(kind === "all" ? undefined : kind),
    kind,
  );
  const [editing, setEditing] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await adminApi.posts.remove(deleting.id);
      toast.success("Пост удалён");
      setDeleting(null);
      reload();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleteLoading(false);
    }
  }

  const columns: Column<Post>[] = [
    {
      id: "author",
      header: "Автор",
      sort: (r) => r.authorName,
      className: "w-44",
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar
            name={r.authorName}
            photoUrl={r.authorPhotoUrl}
            size="sm"
          />
          <span className="truncate font-medium">{r.authorName}</span>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Лента",
      sort: (r) => r.kind,
      cell: (r) => (
        <a
          href={`${KIND_PATH[r.kind]}#post-${r.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {KIND_LABEL[r.kind]}
          <ExternalLinkIcon className="size-3" aria-hidden />
        </a>
      ),
    },
    {
      id: "content",
      header: "Содержимое",
      cell: (r) => (
        <div className="max-w-xl space-y-1">
          {r.nsfw || r.visibility === "members" ? (
            <div className="flex flex-wrap items-center gap-1">
              {r.nsfw ? (
                <Badge variant="destructive" className="text-[11px]">
                  18+
                </Badge>
              ) : null}
              {r.visibility === "members" ? (
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <LockIcon className="size-3" aria-hidden />
                  Только для своих
                </Badge>
              ) : null}
            </div>
          ) : null}
          {r.title ? <div className="font-medium">{r.title}</div> : null}
          {r.kind === "shawarma" ? (
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <RatingStars value={r.rating} />
              {r.price != null ? <span>{r.price} ₽</span> : null}
              {r.address ? <span className="truncate">{r.address}</span> : null}
            </div>
          ) : null}
          <p className="line-clamp-3 break-words whitespace-pre-wrap text-muted-foreground">
            {r.body}
          </p>
          <AttachmentThumbs items={r.attachments} />
        </div>
      ),
    },
    {
      id: "likes",
      header: <HeartIcon className="size-3.5" aria-label="Лайки" />,
      sort: (r) => r.likesCount,
      className: "tabular-nums",
      cell: (r) => r.likesCount,
    },
    {
      id: "comments",
      header: (
        <MessageCircleIcon className="size-3.5" aria-label="Комментарии" />
      ),
      sort: (r) => r.commentsCount,
      className: "tabular-nums",
      cell: (r) => r.commentsCount,
    },
    {
      id: "created",
      header: "Когда",
      sort: (r) => r.createdAt,
      className: "whitespace-nowrap text-muted-foreground",
      cell: (r) => fmtRelative(r.createdAt),
    },
    {
      id: "actions",
      header: <span className="sr-only">Действия</span>,
      className: "w-px",
      cell: (r) => (
        <RowActions
          onEdit={() => setEditing(r)}
          onDelete={() => setDeleting(r)}
        />
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Посты"
        description="Ленты «Шаверма» и «Анекдоты» заполняют студенты. Здесь можно поправить или убрать любой пост."
        actions={
          <Tabs value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
            <TabsList>
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="shawarma">Шаверма</TabsTrigger>
              <TabsTrigger value="joke">Анекдоты</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      <DataTable
        rows={data}
        loading={loading}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSort={{ id: "created", dir: "desc" }}
        emptyTitle="Постов пока нет"
        emptyDescription="Когда студенты начнут писать обзоры и анекдоты, они появятся здесь."
      />
      {editing ? (
        <PostDialog
          kind={editing.kind}
          post={editing}
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          onSave={(input) => adminApi.posts.update(editing.id, input)}
          uploadTarget="adminSocial"
          onSaved={() => reload()}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title="Удалить пост?"
        description={
          deleting
            ? `${KIND_LABEL[deleting.kind]} от ${deleting.authorName}. Вместе с постом удалятся лайки и комментарии.`
            : ""
        }
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />
    </>
  );
}
