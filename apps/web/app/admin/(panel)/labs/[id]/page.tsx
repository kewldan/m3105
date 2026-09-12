"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { LabForm } from "@/components/admin/lab-form";
import { PageTitle } from "@/components/admin/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function EditLabPage() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const subjects = useQuery(() => adminApi.subjects.list());
  const lab = useQuery(() => adminApi.labs.get(numericId), id);

  if (lab.error) {
    return (
      <p className="text-sm text-destructive">
        Лаба не найдена: {lab.error.message}
      </p>
    );
  }
  return (
    <>
      <PageTitle
        title={lab.data ? `Лаба ${lab.data.number}: ${lab.data.title}` : "Лаба"}
        description={lab.data ? lab.data.subjectName : undefined}
        actions={
          lab.data && lab.data.status === "published" ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={`/labs/${lab.data.subjectSlug}/${lab.data.slug}`}
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
      {lab.data && subjects.data ? (
        <LabForm lab={lab.data} subjects={subjects.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
