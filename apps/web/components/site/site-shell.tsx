import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { UserProvider } from "@/components/site/user-provider";
import { getHealth, getSettings } from "@/lib/api/public";
import type { SettingsResponse } from "@/lib/api/types";
import { getViewer } from "@/lib/api/viewer";

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
  },
};

const loadMe = getViewer;

async function loadSite(): Promise<SettingsResponse> {
  try {
    return await getSettings();
  } catch {
    // Keep the chrome rendering even if the API is unavailable; pages report their own errors.
    return FALLBACK;
  }
}

async function loadApiCommit(): Promise<string> {
  try {
    return (await getHealth()).commit;
  } catch {
    return "";
  }
}

/**
 * Public site chrome: header, footer and the signed-in student context.
 * Used by the (site) layout and by the root 404 page, which lives outside the group.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const [site, me, apiCommit] = await Promise.all([
    loadSite(),
    loadMe(),
    loadApiCommit(),
  ]);
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
        className="container-page flex-1 py-6 sm:py-8 lg:py-10 print:max-w-none print:p-0"
      >
        {children}
      </main>
      <SiteFooter
        settings={site.settings}
        apiCommit={apiCommit}
        pageLinks={site.navPages.map((p) => ({
          href: `/p/${p.slug}`,
          label: p.title,
        }))}
      />
    </UserProvider>
  );
}
