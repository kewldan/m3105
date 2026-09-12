import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginPanel } from "@/components/site/auth/login-panel";
import { FadeIn } from "@/components/site/motion";
import { cookieHeader } from "@/lib/api/cookies";
import { getMe, getSettings } from "@/lib/api/public";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Вход",
  description: "Вход через Telegram или по пасскею, без паролей.",
  path: "/login",
  noindex: true,
});

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function safeNext(raw: string | string[] | undefined): string {
  const value = first(raw);
  if (!value?.startsWith("/") || value.startsWith("//")) return "/me";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; dev?: string | string[] }>;
}) {
  const [params, site, me] = await Promise.all([
    searchParams,
    getSettings(),
    getMe(await cookieHeader()),
  ]);
  const target = safeNext(params.next);
  if (me) redirect(target);
  // `?dev=Имя Фамилия` picks the dev account; default keeps one click.
  const devName = (first(params.dev) ?? "").trim() || "Dev Студент";

  return (
    <div className="mx-auto max-w-sm py-6 sm:py-10">
      <FadeIn>
        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <h1 className="mb-5 text-2xl font-bold tracking-tight">Вход</h1>
          <LoginPanel auth={site.auth} next={target} devName={devName} />
        </div>
      </FadeIn>
    </div>
  );
}
