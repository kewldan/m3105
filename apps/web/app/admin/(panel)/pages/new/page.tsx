"use client";

import { PageForm } from "@/components/admin/page-form";
import { PageTitle } from "@/components/admin/page-title";

export default function NewPagePage() {
  return (
    <>
      <PageTitle title="Новая страница" />
      <PageForm page={null} />
    </>
  );
}
