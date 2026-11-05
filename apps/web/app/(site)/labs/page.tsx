import type { Metadata } from "next";
import { ScopeSwitch } from "@/components/site/audience/scope-switch";
import { LabsBrowser } from "@/components/site/labs/labs-browser";
import { PageHeader } from "@/components/site/page-header";
import { getLabs, getSettings } from "@/lib/api/public";
import { getViewerScope } from "@/lib/api/viewer";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Лабораторные",
  description:
    "Все лабораторные работы семестра: дедлайны, требования, порядок сдачи и материалы.",
  path: "/labs",
  markdown: true,
});

export default async function LabsPage() {
  const scope = await getViewerScope();
  const [labs, site] = await Promise.all([
    getLabs(undefined, scope.forGroup),
    getSettings(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Практика"
        title="Лабораторные"
        description="Все лабы семестра: дедлайны, требования и как сдавать. Отмечайте сданные, чтобы видеть прогресс."
        actions={<ScopeSwitch group={scope.group} all={scope.all} />}
      />
      <LabsBrowser labs={labs} now={site.now} tz={site.settings.timezone} />
    </div>
  );
}
