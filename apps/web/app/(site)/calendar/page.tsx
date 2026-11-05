import type { Metadata } from "next";
import { ScopeSwitch } from "@/components/site/audience/scope-switch";
import { CalendarView } from "@/components/site/calendar/calendar-view";
import { PageHeader } from "@/components/site/page-header";
import { getCalendar, getSettings } from "@/lib/api/public";
import { getViewerScope } from "@/lib/api/viewer";
import { inTz, toYmd } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Календарь",
  description:
    "Дедлайны лабораторных, контрольные, экзамены и сдачи по всем предметам в одном календаре и ICS-подписка для Google, Apple и Outlook с напоминанием за сутки.",
  path: "/calendar",
});

export default async function CalendarPage() {
  const [site, scope] = await Promise.all([getSettings(), getViewerScope()]);
  const tz = site.settings.timezone;
  const nowTz = inTz(site.now, tz);
  const from = new Date(nowTz.getFullYear(), nowTz.getMonth() - 1, 1);
  const to = new Date(nowTz.getFullYear(), nowTz.getMonth() + 7, 0);
  const calendar = await getCalendar({
    from: toYmd(from, tz),
    to: toYmd(to, tz),
    for: scope.forGroup,
  });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Дедлайны и события"
        title="Календарь"
        description="Дедлайны лабораторных, контрольные, экзамены и сдачи. Подпишитесь, чтобы напоминания приходили в ваш календарь."
        actions={<ScopeSwitch group={scope.group} all={scope.all} />}
      />
      <CalendarView
        items={calendar.items}
        now={calendar.now}
        tz={tz}
        feedGroup={scope.forGroup}
      />
    </div>
  );
}
