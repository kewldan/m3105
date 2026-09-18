"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField } from "@/components/admin/form-field";
import {
  AttachButton,
  AttachmentTray,
  useAttachments,
  useFileDrop,
} from "@/components/site/attachments/picker";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type { AdminComment } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Moderation edit of any comment: text and files. */
export function CommentDialog({
  comment,
  onOpenChange,
  onSaved,
}: {
  comment: AdminComment | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const files = useAttachments({ target: "adminSocial" });
  const resetFiles = files.reset;
  const { dragging, dropProps } = useFileDrop(files.add);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetFiles changes every render; the form resets only when another comment opens.
  useEffect(() => {
    if (!comment) return;
    setBody(comment.body);
    resetFiles(comment.attachments);
  }, [comment]);

  async function save() {
    if (!comment || files.uploading) return;
    if (!body.trim() && files.ids.length === 0) {
      toast.error("Оставьте текст или хотя бы один файл");
      return;
    }
    setSaving(true);
    try {
      await adminApi.comments.update(comment.id, {
        body: body.trim(),
        attachmentIds: files.ids,
      });
      toast.success("Комментарий сохранён");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <EntityDialog
      open={comment !== null}
      onOpenChange={onOpenChange}
      title="Редактировать комментарий"
      description={
        comment
          ? `${comment.authorName} · ${comment.targetTitle ?? "удалено"}`
          : undefined
      }
      onSubmit={save}
      saving={saving || files.uploading}
      saveLabel={files.uploading ? "Загружаем файлы…" : "Сохранить"}
    >
      <FormField label="Текст" htmlFor="comment-body">
        <Textarea
          id="comment-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={files.onPaste}
          maxLength={2000}
          rows={5}
        />
      </FormField>
      <FormField
        label="Файлы"
        description="Можно убрать лишнее или добавить свои: вставкой, перетаскиванием или кнопкой."
      >
        <div
          className={cn(
            "space-y-2 rounded-lg transition-colors",
            dragging && "bg-primary/5 ring-2 ring-primary/40",
          )}
          {...dropProps}
        >
          <AttachmentTray state={files} />
          <AttachButton state={files} label="Добавить" className="-ml-2" />
        </div>
      </FormField>
    </EntityDialog>
  );
}
