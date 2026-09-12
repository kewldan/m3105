import { getSubject } from "@/lib/api/public";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/image";
import { metaText } from "@/lib/seo";

export const alt = "Предмет";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const { subject, labs, notes } = await getSubject(slug);
    const parts = [
      subject.teacher ? `Преподаватель: ${subject.teacher}` : "",
      labs.length ? `Лаб: ${labs.length}` : "",
      notes.length ? `Конспектов: ${notes.length}` : "",
    ].filter(Boolean);
    return ogImage({
      eyebrow: "Предмет",
      title: subject.name,
      description: parts.join(" · ") || metaText(subject.description, 150),
      color: subject.color,
    });
  } catch {
    return ogImage({ eyebrow: "Предмет", title: "Предмет" });
  }
}
