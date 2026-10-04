import type { Metadata } from "next";

import { PageHeader } from "@/components/site/page-header";
import { GroupGate } from "@/components/site/social/group-gate";
import { PostFeed } from "@/components/site/social/post-feed";
import { cookieHeader } from "@/lib/api/cookies";
import { getPosts, getSettings } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Шаверма",
  description:
    "Обзоры шавермы рядом с универом от студентов группы: где вкусно, сколько стоит и стоит ли идти снова.",
  path: "/shawarma",
  noindex: true,
});

export default async function ShawarmaPage() {
  const [feed, site] = await Promise.all([
    getPosts("shawarma", "new", await cookieHeader()),
    getSettings(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Гастрономический рейтинг"
        title="Шаверма"
        description="Где рядом с универом кормят вкусно, а где лучше не рисковать. Обзоры пишут сами студенты."
      />
      {"posts" in feed ? (
        <PostFeed kind="shawarma" initial={feed.posts} />
      ) : (
        <GroupGate
          reason={feed.denied}
          group={site.settings.groupName}
          next="/shawarma"
        />
      )}
    </div>
  );
}
