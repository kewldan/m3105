"use client";

import { NoteForm } from "@/components/admin/note-form";
import { PageTitle } from "@/components/admin/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function NewNotePage() {
  const subjects = useQuery(() => adminApi.subjects.list());
  return (
    <>
      <PageTitle title="Новый конспект" />
      {subjects.data ? (
        <NoteForm note={null} subjects={subjects.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
