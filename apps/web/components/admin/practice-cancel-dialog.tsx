"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EntityDialog } from "@/components/admin/entity-dialog";
import { FormField } from "@/components/admin/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/admin/errors";
import { adminApi } from "@/lib/api/admin";
import type { PracticeSession } from "@/lib/api/types";
import { fmtDateTime, plural } from "@/lib/format";

/**
 * Cancels one session. The signed-up students get a message from the bot;
 * their signups can go to `next` — the subject's next session for the same
 * audience.
 */
export function PracticeCancelDialog({
  session,
  next,
  onOpenChange,
  onDone,
}: {
  session: PracticeSession | null;
  next: PracticeSession | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [move, setMove] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session) {
      setReason("");
      setMove(false);
    }
  }, [session]);

  async function submit() {
    if (!session) return;
    setSaving(true);
    try {
      await adminApi.practice.cancel(session.id, {
        reason,
        moveSignups: move && next !== null,
      });
      toast.success("Занятие отменено");
      onDone();
      onOpenChange(false);
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  }

  const signups = session?.signupsCount ?? 0;
  return (
    <EntityDialog
      open={session !== null}
      onOpenChange={onOpenChange}
      title="Отменить занятие?"
      description={
        session
          ? `${session.subjectShortName || session.subjectName}, ${fmtDateTime(session.startsAt)}. Занятие останется в расписании с пометкой «Отменено», записаться на него будет нельзя. Вернуть можно в любой момент.`
          : undefined
      }
      onSubmit={() => void submit()}
      saving={saving}
      saveLabel="Отменить занятие"
    >
      <div className="space-y-5">
        <FormField
          label="Причина"
          htmlFor="cancel-reason"
          description="Её увидят студенты на сайте и в сообщении бота."
        >
          <Textarea
            id="cancel-reason"
            rows={2}
            maxLength={300}
            placeholder="Праздник, преподаватель болеет…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
        {signups > 0 ? (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p>
              Записалось {signups}{" "}
              {plural(signups, "студент", "студента", "студентов")}: бот напишет
              каждому.
            </p>
            {next ? (
              <Label
                htmlFor="cancel-move"
                className="flex items-start gap-2 font-normal"
              >
                <Checkbox
                  id="cancel-move"
                  checked={move}
                  onCheckedChange={(v) => setMove(v === true)}
                />
                <span>
                  Перенести записи на {fmtDateTime(next.startsAt)}
                  <span className="block text-xs text-muted-foreground">
                    Время записи сохранится, так что в очереди они встанут
                    раньше новых.
                  </span>
                </span>
              </Label>
            ) : (
              <p className="text-muted-foreground">
                Следующей сдачи для этой аудитории нет — записи останутся на
                отменённом занятии.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </EntityDialog>
  );
}
