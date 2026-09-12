"use client";

import { LabForm } from "@/components/admin/lab-form";
import { PageTitle } from "@/components/admin/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function NewLabPage() {
  const subjects = useQuery(() => adminApi.subjects.list());
  return (
    <>
      <PageTitle
        title="Новая лаба"
        description="Заполните основное, добавьте дедлайн и текст задания."
      />
      {subjects.data ? (
        <LabForm lab={null} subjects={subjects.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
