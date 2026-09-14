import {
  getLab,
  getNote,
  getPage,
  getSettings,
  getSubject,
} from "@/lib/api/public";
import { fmtDate, fmtDateOnly, plural } from "@/lib/format";
import { type OgKind, ogImage } from "@/lib/og/image";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

/**
 * Open Graph images: /og/site, /og/subject/{slug}, /og/lab/{subject}/{slug},
 * /og/note/{subject}/{slug}, /og/page/{slug}. Pages reference these explicitly via
 * pageMetadata(): Next drops the file-based opengraph-image of a segment as soon as
 * that segment defines `openGraph` in its metadata, so the file convention can't be used.
 */

export const dynamic = "force-dynamic";

const KINDS: OgKind[] = ["site", "subject", "lab", "note", "page"];

function isKind(value: string): value is OgKind {
  return (KINDS as string[]).includes(value);
}

async function siteImage() {
  let title = SITE_NAME;
  let description = DEFAULT_DESCRIPTION;
  try {
    const site = await getSettings();
    title = site.settings.siteTitle || SITE_NAME;
    description = site.settings.description || DEFAULT_DESCRIPTION;
  } catch {
    // API is down: fall back to static text.
  }
  return ogImage({ kind: "site", eyebrow: "Сайт группы", title, description });
}

async function subjectImage(slug: string) {
  const { subject, labs, notes } = await getSubject(slug);
  const chips = [
    labs.length
      ? `${labs.length} ${plural(labs.length, "лаба", "лабы", "лаб")}`
      : "",
    notes.length
      ? `${notes.length} ${plural(notes.length, "конспект", "конспекта", "конспектов")}`
      : "",
    subject.teacher,
  ];
  return ogImage({
    kind: "subject",
    eyebrow: "Предмет",
    title: subject.name,
    description: subject.description,
    chips,
    color: subject.color,
  });
}

async function labImage(subject: string, slug: string) {
  const lab = await getLab(subject, slug);
  const chips = [
    lab.deadlineAt ? `Дедлайн ${fmtDate(lab.deadlineAt)}` : "",
    lab.maxScore
      ? `${lab.maxScore} ${plural(lab.maxScore, "балл", "балла", "баллов")}`
      : "",
    lab.teacher,
  ];
  return ogImage({
    kind: "lab",
    eyebrow: `Лаба ${lab.number} · ${lab.subjectShortName || lab.subjectName}`,
    title: lab.title,
    description: lab.summary,
    chips,
    color: lab.subjectColor || undefined,
    figure: lab.number,
  });
}

async function noteImage(subject: string, slug: string) {
  const note = await getNote(subject, slug);
  const chips = [
    `Лекция ${note.number}`,
    note.lectureDate ? fmtDateOnly(note.lectureDate) : "",
    note.quizzes.length
      ? `${note.quizzes.length} ${plural(note.quizzes.length, "квиз", "квиза", "квизов")}`
      : "",
  ];
  return ogImage({
    kind: "note",
    eyebrow: `Конспект · ${note.subjectShortName || note.subjectName}`,
    title: note.title,
    description: note.summary,
    chips,
    color: note.subjectColor || undefined,
    figure: note.number,
  });
}

async function pageImage(slug: string) {
  const page = await getPage(slug);
  return ogImage({
    kind: "page",
    title: page.title,
    description: page.summary,
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; parts?: string[] }> },
) {
  const { kind, parts = [] } = await params;
  if (!isKind(kind)) return new Response(null, { status: 404 });
  try {
    switch (kind) {
      case "site":
        return await siteImage();
      case "subject":
        if (parts.length !== 1) break;
        return await subjectImage(parts[0]);
      case "lab":
        if (parts.length !== 2) break;
        return await labImage(parts[0], parts[1]);
      case "note":
        if (parts.length !== 2) break;
        return await noteImage(parts[0], parts[1]);
      case "page":
        if (parts.length !== 1) break;
        return await pageImage(parts[0]);
    }
  } catch {
    // Unknown entity or API failure: fall through to the generic site card so
    // link previews never break.
    return siteImage();
  }
  return new Response(null, { status: 404 });
}
