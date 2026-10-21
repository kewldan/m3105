"use client";

import { TrophyIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { IsuForm } from "@/components/site/grades/isu-form";
import { LetterChip } from "@/components/site/grades/letter-chip";
import { PartBars } from "@/components/site/grades/part-bars";
import { ScoreRing } from "@/components/site/grades/score-ring";
import { ProfileCard as Card } from "@/components/site/me/card";
import { SubjectBadge } from "@/components/site/subject-badge";
import { Button } from "@/components/ui/button";
import type { MeResponse, MyGrade, Place } from "@/lib/api/types";
import { fmtRelative } from "@/lib/format";
import { fmtScore, toNextLetter } from "@/lib/grades";

function PlaceChip({ place, label }: { place: Place; label: string }) {
  if (place.size === 0) return null;
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
      <span className="font-semibold tabular-nums">
        {place.rank === 1 ? "🥇 " : ""}
        {place.rank}
      </span>
      <span className="text-muted-foreground">
        из {place.size} {label}
      </span>
    </span>
  );
}

function GradeRow({ g }: { g: MyGrade }) {
  const next = toNextLetter(g.total, g.source.maxTotal);
  return (
    <li className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-start">
      <ScoreRing
        total={g.total}
        max={g.source.maxTotal}
        color={g.source.subjectColor}
        size={88}
        className="self-center sm:self-start"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SubjectBadge
            name={g.source.title}
            color={g.source.subjectColor}
            icon={g.source.subjectIcon}
            size="md"
          />
          <LetterChip total={g.total} max={g.source.maxTotal} />
          {next ? (
            <span className="text-xs text-muted-foreground">
              до {next.letter} — {fmtScore(next.points)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {g.source.membersOnly ? (
            <PlaceChip place={g.course} label="в таблице" />
          ) : (
            <>
              <PlaceChip place={g.inGroup} label="в группе" />
              <PlaceChip place={g.course} label="на курсе" />
            </>
          )}
          <PlaceChip place={g.site} label="на сайте" />
        </div>
        <PartBars
          columns={g.source.columns}
          parts={g.parts}
          color={g.source.subjectColor}
        />
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>Менялись {fmtRelative(g.changedAt)}</span>
          {g.source.syncedAt ? (
            <span>сверено с таблицей {fmtRelative(g.source.syncedAt)}</span>
          ) : null}
          <Link
            href={`/grades?source=${g.source.id}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Рейтинг
          </Link>
        </div>
      </div>
    </li>
  );
}

/** Scores from the sheets linked by ISU number, with places in the rating. */
export function GradesCard({
  me,
  onSaved,
}: {
  me: MeResponse;
  onSaved: (next: MeResponse) => void;
}) {
  const [editing, setEditing] = useState(false);
  const linked = me.user.isu !== "";

  return (
    <Card
      title="Баллы"
      icon={TrophyIcon}
      action={
        <Button variant="ghost" size="sm" render={<Link href="/grades" />}>
          Рейтинг
        </Button>
      }
    >
      {!linked ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-pretty">
            Укажите номер ИСУ — по нему найдём вас в таблицах с баллами, покажем
            место в группе и на курсе, а бот напишет, когда баллы изменятся.
            Номер есть в личном кабинете ИТМО и на студенческом.
          </p>
          <IsuForm me={me} onSaved={onSaved} />
        </div>
      ) : me.grades.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground text-pretty">
            В таблицах пока нет строки с номером {me.user.isu}. Если номер
            верный, баллы появятся после ближайшей синхронизации.
          </p>
          <IsuForm me={me} onSaved={onSaved} />
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-3">
            {me.grades.map((g) => (
              <GradeRow key={g.source.id} g={g} />
            ))}
          </ul>
          {editing ? (
            <IsuForm
              me={me}
              onSaved={(next) => {
                onSaved(next);
                setEditing(false);
              }}
              autoFocus
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              ИСУ {me.user.isu} ·{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={() => setEditing(true)}
              >
                изменить
              </button>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
