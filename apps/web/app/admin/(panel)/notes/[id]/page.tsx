"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { NoteForm } from "@/components/admin/note-form";
import { PageTitle } from "@/components/admin/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function EditNotePage() {
  const { id } = useParams<{ id: string }>();
  const subjects = useQuery(() => adminApi.subjects.list());
  const note = useQuery(() => adminApi.notes.get(Number(id)), id);

  if (note.error)
    return (
      <p className="text-sm text-destructive">
        Конспект не найден: {note.error.message}
      </p>
    );
  return (
    <>
      <PageTitle
        title={
          note.data
            ? `Лекция ${note.data.number}: ${note.data.title}`
            : "Конспект"
        }
        description={note.data?.subjectName}
        actions={
          note.data && note.data.status === "published" ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={`/notes/${note.data.subjectSlug}/${note.data.slug}`}
                  target="_blank"
                />
              }
            >
              <ExternalLinkIcon data-icon="inline-start" />
              На сайте
            </Button>
          ) : null
        }
      />
      {note.data && subjects.data ? (
        <NoteForm note={note.data} subjects={subjects.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
