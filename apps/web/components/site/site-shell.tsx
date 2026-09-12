import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { UserProvider } from "@/components/site/user-provider";
import { cookieHeader } from "@/lib/api/cookies";
import { getMe, getSettings } from "@/lib/api/public";
import type { MeResponse, SettingsResponse } from "@/lib/api/types";

const FALLBACK: SettingsResponse = {
  settings: {
    siteTitle: "М3105",
    groupName: "М3105",
    description: "",
    semesterStart: null,
    semesterEnd: null,
    firstWeekParity: "odd",
    timezone: "Europe/Moscow",
    links: [],
    inviteCode: "",
    updatedAt: "",
  },
  week: {
    number: 0,
    parity: "odd",
    start: "",
    inRange: false,
    configured: false,
  },
  now: new Date().toISOString(),
  navPages: [],
  auth: {
    telegramBot: "",
    telegramBotId: "",
    devLogin: false,
    inviteRequired: false,
  },
};

async function loadMe(): Promise<MeResponse | null> {
  try {
    return await getMe(await cookieHeader());
  } catch {
    return null;
  }
}

async function loadSite(): Promise<SettingsResponse> {
  try {
    return await getSettings();
  } catch {
    // Keep the chrome rendering even if the API is unavailable; pages report their own errors.
    return FALLBACK;
  }
}

/**
 * Public site chrome: header, footer and the signed-in student context.
 * Used by the (site) layout and by the root 404 page, which lives outside the group.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const [site, me] = await Promise.all([loadSite(), loadMe()]);
  return (
    <UserProvider initial={me}>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
      >
        К содержимому
      </a>
      <SiteHeader site={site} />
      <main
        id="content"
        className="container-page flex-1 py-6 sm:py-8 lg:py-10"
      >
        {children}
      </main>
      <SiteFooter
        settings={site.settings}
        pageLinks={site.navPages.map((p) => ({
          href: `/p/${p.slug}`,
          label: p.title,
        }))}
      />
    </UserProvider>
  );
}
