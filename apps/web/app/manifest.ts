import type { MetadataRoute } from "next";

import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — сайт группы`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    lang: "ru",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    categories: ["education"],
    shortcuts: [
      { name: "Конспекты", url: "/notes" },
      { name: "Календарь", url: "/calendar" },
      { name: "Лабы", url: "/labs" },
    ],
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
