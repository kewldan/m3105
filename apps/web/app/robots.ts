import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

/** Rendered per request so the host comes from the runtime environment. */
export const dynamic = "force-dynamic";

const DISALLOW = ["/admin", "/api/", "/login", "/me", "/offline"];
// Из API индексировать стоит картинки конспектов, календарь и спеку: правило
// длиннее, поэтому перекрывает `/api/`.
const ALLOW = [
  "/",
  "/api/v1/files/",
  "/api/v1/calendar.ics",
  "/api/v1/openapi.yaml",
];

// ИИ-краулеры и ассистенты, которым явно открыт публичный контент: учебные
// материалы группы и должны находиться через ChatGPT, Claude, Perplexity и т. п.
// Для них есть /llms.txt и Markdown-версии страниц.
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "MistralAI-User",
  "DuckAssistBot",
  "YandexAdditional",
  "YandexAdditionalBot",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ALLOW, disallow: DISALLOW },
      // Те же правила, но явно: часть ботов ищет свою группу и без неё
      // считает сайт закрытым для ИИ.
      { userAgent: AI_AGENTS, allow: ALLOW, disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
