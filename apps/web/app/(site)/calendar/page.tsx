import type { Metadata } from "next";

import { CalendarView } from "@/components/site/calendar/calendar-view";
import { PageHeader } from "@/components/site/page-header";
import { getCalendar, getSettings } from "@/lib/api/public";
import { inTz, toYmd } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Календарь дедлайнов",
  description:
    "Дедлайны лабораторных по всем предметам в одном календаре и ICS-подписка для Google, Apple и Outlook с напоминанием за сутки.",
  path: "/calendar",
});

export default async function CalendarPage() {
  const site = await getSettings();
  const tz = site.settings.timezone;
  const nowTz = inTz(site.now, tz);
  const from = new Date(nowTz.getFullYear(), nowTz.getMonth() - 1, 1);
  const to = new Date(nowTz.getFullYear(), nowTz.getMonth() + 7, 0);
  const calendar = await getCalendar({
    from: toYmd(from, tz),
    to: toYmd(to, tz),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Дедлайны лаб"
        title="Календарь"
        description="Только мягкие дедлайны лабораторных. Подпишитесь, чтобы напоминания приходили в ваш календарь."
      />
      <CalendarView items={calendar.items} now={calendar.now} tz={tz} />
    </div>
  );
}
