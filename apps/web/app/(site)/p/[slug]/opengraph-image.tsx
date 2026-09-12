import { getPage } from "@/lib/api/public";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/image";

export const alt = "Страница";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const page = await getPage(slug);
    return ogImage({ title: page.title, description: page.summary });
  } catch {
    return ogImage({ title: "Страница" });
  }
}
