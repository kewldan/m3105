"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageTitle } from "@/components/admin/page-title";
import { QuizForm } from "@/components/admin/quiz-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function EditQuizPage() {
  const { id } = useParams<{ id: string }>();
  const subjects = useQuery(() => adminApi.subjects.list());
  const quiz = useQuery(() => adminApi.quizzes.get(Number(id)), id);

  if (quiz.error)
    return (
      <p className="text-sm text-destructive">
        Квиз не найден: {quiz.error.message}
      </p>
    );
  return (
    <>
      <PageTitle
        title={quiz.data?.title ?? "Квиз"}
        description={quiz.data?.subjectName || undefined}
        actions={
          quiz.data && quiz.data.status === "published" ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href={`/quizzes/${quiz.data.slug}`} target="_blank" />
              }
            >
              <ExternalLinkIcon data-icon="inline-start" />
              На сайте
            </Button>
          ) : null
        }
      />
      {quiz.data && subjects.data ? (
        <QuizForm quiz={quiz.data} subjects={subjects.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
