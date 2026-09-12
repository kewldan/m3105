import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

/** Rendered per request so the host comes from the runtime environment. */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/login", "/me"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
