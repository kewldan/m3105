import type { Metadata } from "next";

import { PageHeader } from "@/components/site/page-header";
import { PostFeed } from "@/components/site/social/post-feed";
import { cookieHeader } from "@/lib/api/cookies";
import { getPosts } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Шаверма",
  description:
    "Обзоры шавермы рядом с универом от студентов группы: где вкусно, сколько стоит и стоит ли идти снова.",
  path: "/shawarma",
});

export default async function ShawarmaPage() {
  const posts = await getPosts("shawarma", "new", await cookieHeader());
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Гастрономический рейтинг"
        title="Шаверма"
        description="Где рядом с универом кормят вкусно, а где лучше не рисковать. Обзоры пишут сами студенты."
      />
      <PostFeed kind="shawarma" initial={posts} />
    </div>
  );
}
