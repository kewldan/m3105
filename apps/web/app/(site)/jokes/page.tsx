import type { Metadata } from "next";

import { PageHeader } from "@/components/site/page-header";
import { PostFeed } from "@/components/site/social/post-feed";
import { cookieHeader } from "@/lib/api/cookies";
import { getPosts } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Анекдоты",
  description:
    "Анекдоты и байки группы М3105: студенты пишут, группа лайкает и комментирует.",
  path: "/jokes",
});

export default async function JokesPage() {
  const posts = await getPosts("joke", "new", await cookieHeader());
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Между парами"
        title="Анекдоты"
        description="Свои и услышанные на лекциях. Лайкайте лучшие, чтобы они поднимались наверх."
      />
      <PostFeed kind="joke" initial={posts} />
    </div>
  );
}
