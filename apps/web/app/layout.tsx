import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import type React from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSettings } from "@/lib/api/public";
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  LOCALE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  let siteTitle = SITE_NAME;
  let description = DEFAULT_DESCRIPTION;
  try {
    const site = await getSettings();
    siteTitle = site.settings.siteTitle || SITE_NAME;
    description = site.settings.description || DEFAULT_DESCRIPTION;
  } catch {
    // API unreachable: keep static defaults so the shell still renders.
  }
  const images = [
    {
      url: absoluteUrl(DEFAULT_OG_IMAGE),
      width: 1200,
      height: 630,
      alt: siteTitle,
    },
  ];
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: siteTitle,
    title: {
      default: siteTitle,
      template: `%s — ${siteTitle}`,
    },
    description,
    keywords: [
      "ИТМО",
      siteTitle,
      "группа",
      "лабораторные",
      "дедлайны",
      "конспекты лекций",
      "квизы",
      "расписание",
    ],
    category: "education",
    robots: { index: true, follow: true },
    alternates: { canonical: absoluteUrl("/") },
    openGraph: {
      type: "website",
      siteName: siteTitle,
      locale: LOCALE,
      url: absoluteUrl("/"),
      title: siteTitle,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description,
      images,
    },
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${inter.variable} ${manrope.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
