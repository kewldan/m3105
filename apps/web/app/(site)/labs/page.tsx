import type { Metadata } from "next";

import { LabsBrowser } from "@/components/site/labs/labs-browser";
import { PageHeader } from "@/components/site/page-header";
import { getLabs, getSettings } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Лабораторные",
  description:
    "Все лабораторные работы семестра: дедлайны, требования, порядок сдачи и материалы.",
  path: "/labs",
});

export default async function LabsPage() {
  const [labs, site] = await Promise.all([getLabs(), getSettings()]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Практика"
        title="Лабораторные"
        description="Все лабы семестра: дедлайны, требования и как сдавать. Отмечайте сданные, чтобы видеть прогресс."
      />
      <LabsBrowser labs={labs} now={site.now} tz={site.settings.timezone} />
    </div>
  );
}
