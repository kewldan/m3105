"use client";

import { PageTitle } from "@/components/admin/page-title";
import { QuizForm } from "@/components/admin/quiz-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function NewQuizPage() {
  const subjects = useQuery(() => adminApi.subjects.list());
  return (
    <>
      <PageTitle title="Новый квиз" />
      {subjects.data ? (
        <QuizForm quiz={null} subjects={subjects.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
