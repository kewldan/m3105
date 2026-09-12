import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Profile } from "@/components/site/me/profile";
import { PageHeader } from "@/components/site/page-header";
import { cookieHeader } from "@/lib/api/cookies";
import { getLabs, getMe, getSettings } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Профиль",
  description: "Сданные лабы, записи на сдачу и способы входа.",
  path: "/me",
  noindex: true,
});

export default async function MePage() {
  const me = await getMe(await cookieHeader());
  if (!me) redirect("/login?next=%2Fme");
  const [site, labs] = await Promise.all([getSettings(), getLabs()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Аккаунт"
        title="Профиль"
        description="Сданные лабы, записи на сдачу и способы входа."
      />
      <Profile initial={me} labs={labs} tz={site.settings.timezone} />
    </div>
  );
}
