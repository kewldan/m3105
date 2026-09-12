"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { PageForm } from "@/components/admin/page-form";
import { PageTitle } from "@/components/admin/page-title";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@/lib/admin/use-query";
import { adminApi } from "@/lib/api/admin";

export default function EditPagePage() {
  const { id } = useParams<{ id: string }>();
  const page = useQuery(() => adminApi.pages.get(Number(id)), id);

  if (page.error)
    return (
      <p className="text-sm text-destructive">
        Страница не найдена: {page.error.message}
      </p>
    );
  return (
    <>
      <PageTitle
        title={page.data?.title ?? "Страница"}
        actions={
          page.data && page.data.status === "published" ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/p/${page.data.slug}`} target="_blank" />}
            >
              <ExternalLinkIcon data-icon="inline-start" />
              На сайте
            </Button>
          ) : null
        }
      />
      {page.data ? (
        <PageForm page={page.data} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </>
  );
}
