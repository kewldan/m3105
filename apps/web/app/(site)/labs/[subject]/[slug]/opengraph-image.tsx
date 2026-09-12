import { getLab } from "@/lib/api/public";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/image";

export const alt = "Лабораторная работа";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ subject: string; slug: string }>;
}) {
  const { subject, slug } = await params;
  try {
    const lab = await getLab(subject, slug);
    return ogImage({
      eyebrow: `Лаба ${lab.number} · ${lab.subjectShortName || lab.subjectName}`,
      title: lab.title,
      description: lab.summary,
      color: lab.subjectColor || undefined,
    });
  } catch {
    return ogImage({ eyebrow: "Лабораторная", title: "Лабораторная работа" });
  }
}
