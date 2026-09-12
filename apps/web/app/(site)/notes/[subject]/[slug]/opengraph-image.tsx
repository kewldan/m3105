import { getNote } from "@/lib/api/public";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og/image";

export const alt = "Конспект лекции";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ subject: string; slug: string }>;
}) {
  const { subject, slug } = await params;
  try {
    const note = await getNote(subject, slug);
    return ogImage({
      eyebrow: `Конспект · ${note.subjectShortName || note.subjectName}`,
      title: note.title,
      description: note.summary,
      color: note.subjectColor || undefined,
    });
  } catch {
    return ogImage({ eyebrow: "Конспект", title: "Конспект лекции" });
  }
}
