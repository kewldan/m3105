import { getSettings } from "@/lib/api/public";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/image";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

/** Settings come from the API, so render on request instead of at build time. */
export const dynamic = "force-dynamic";

export const alt = `${SITE_NAME} — сайт группы`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  let title = SITE_NAME;
  let description = DEFAULT_DESCRIPTION;
  try {
    const site = await getSettings();
    title = site.settings.siteTitle || SITE_NAME;
    description = site.settings.description || DEFAULT_DESCRIPTION;
  } catch {
    // API is down: fall back to static text.
  }
  return ogImage({
    eyebrow: "Сайт группы",
    title,
    description,
  });
}
