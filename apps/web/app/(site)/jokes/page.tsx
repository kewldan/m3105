import type { Metadata } from "next";

import { PageHeader } from "@/components/site/page-header";
import { GroupGate } from "@/components/site/social/group-gate";
import { PostFeed } from "@/components/site/social/post-feed";
import { cookieHeader } from "@/lib/api/cookies";
import { getPosts, getSettings } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Анекдоты",
  description:
    "Анекдоты и байки группы М3105: студенты пишут, группа лайкает и комментирует.",
  path: "/jokes",
  noindex: true,
});

export default async function JokesPage() {
  const [feed, site] = await Promise.all([
    getPosts("joke", "new", await cookieHeader()),
    getSettings(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Между парами"
        title="Анекдоты"
        description="Свои и услышанные на лекциях. Лайкайте лучшие, чтобы они поднимались наверх."
      />
      {"posts" in feed ? (
        <PostFeed kind="joke" initial={feed.posts} />
      ) : (
        <GroupGate
          reason={feed.denied}
          group={site.settings.groupName}
          next="/jokes"
        />
      )}
    </div>
  );
}
