import "server-only";

import { isNotFound } from "@/lib/api/client";
import {
  getFAQ,
  getHome,
  getLab,
  getLabs,
  getNote,
  getNotes,
  getPage,
  getPages,
  getSettings,
  getSubject,
  getSubjects,
} from "@/lib/api/public";
import type {
  CalendarItem,
  FAQItem,
  Lab,
  Note,
  Page,
  SubjectWithCounts,
} from "@/lib/api/types";
import {
  DEFAULT_TZ,
  EVENT_KIND_LABEL,
  fmtDateOnly,
  fmtDateYear,
  fmtTime,
  parityLabel,
  plural,
} from "@/lib/format";
import { absoluteUrl, DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";

import { mdxToMarkdown } from "./markdown";
import { hasMarkdown, markdownPath } from "./paths";

/**
 * Markdown-версии публичных страниц для ИИ-агентов и `llms.txt`. Отдаются
 * роутом app/md по адресу страницы с `.md` или по `Accept: text/markdown`
 * (rewrites в next.config.ts). Каждый документ начинается с заголовка и
 * строки метаданных, ссылки в нём абсолютные и ведут на `.md`-версии.
 */

const mdUrl = (path: string) => absoluteUrl(markdownPath(path));

type Site = { title: string; description: string; tz: string };

async function site(): Promise<Site> {
  try {
    const { settings } = await getSettings();
    return {
      title: settings.siteTitle || SITE_NAME,
      description: settings.description || DEFAULT_DESCRIPTION,
      tz: settings.timezone || DEFAULT_TZ,
    };
  } catch {
    return {
      title: SITE_NAME,
      description: DEFAULT_DESCRIPTION,
      tz: DEFAULT_TZ,
    };
  }
}

/** Null for 404 from the API, so the route answers 404 too. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

const esc = (s: string) => s.replace(/([[\]\\])/g, "\\$1");
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const link = (title: string, url: string) => `[${esc(title)}](${url})`;
/** List entry `- [title](url): summary` in the llms.txt style. */
const entry = (title: string, url: string, summary?: string) =>
  `- ${link(title, url)}${summary?.trim() ? `: ${oneLine(summary)}` : ""}`;

const doc = (...parts: (string | false | null | undefined)[]) =>
  `${parts
    .filter((p): p is string => !!p && !!p.trim())
    .join("\n\n")
    .trim()}\n`;

const facts = (rows: [string, string | false | null | undefined][]) =>
  rows
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

const notePath = (n: Note) => `/notes/${n.subjectSlug}/${n.slug}`;
const labPath = (l: Lab) => `/labs/${l.subjectSlug}/${l.slug}`;
const labTitle = (l: Lab) => `Лаба ${l.number}. ${l.title}`;

/** "27 октября 2026 г., 23:59 (Europe/Moscow)": with the year and zone for agents. */
const at = (iso: string, tz: string) =>
  `${fmtDateYear(iso, tz)}, ${fmtTime(iso, tz)} (${tz})`;

/** Joins phrases into sentences without doubling a trailing period. */
const sentences = (parts: (string | false | null | undefined)[]) =>
  parts
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => p.trim())
    .reduce(
      (acc, p) => (acc ? `${acc}${/[.!?]$/.test(acc) ? "" : "."} ${p}` : p),
      "",
    );

const count = (n: number, one: string, few: string, many: string) =>
  `${n} ${plural(n, one, few, many)}`;

function deadline(l: Lab, tz: string): string | null {
  if (!l.deadlineAt) return l.deadlineNote || null;
  return sentences([at(l.deadlineAt, tz), l.deadlineNote]);
}

function calendarLine(it: CalendarItem, tz: string): string {
  const kind = EVENT_KIND_LABEL[it.kind] ?? it.kind;
  const when = it.allDay ? fmtDateYear(it.startsAt, tz) : at(it.startsAt, tz);
  const subject = it.subject ? ` — ${it.subject.name}` : "";
  const href = it.path
    ? absoluteUrl(hasMarkdown(it.path) ? markdownPath(it.path) : it.path)
    : it.url;
  const title = href ? link(it.title, href) : esc(it.title);
  const where = it.location ? `, ${it.location}` : "";
  return `- ${when}: ${kind}${subject}: ${title}${where}`;
}

export async function homeMarkdown(): Promise<string> {
  const [{ title, description, tz }, home] = await Promise.all([
    site(),
    getHome(),
  ]);
  return doc(
    `# ${title}`,
    `> ${oneLine(description)}`,
    facts([
      ["Сайт", absoluteUrl("/")],
      ["Данные на", at(home.now, tz)],
      [
        "Неделя",
        home.week.configured &&
          home.week.inRange &&
          `${home.week.number}-я, ${parityLabel(home.week.parity).toLowerCase()}`,
      ],
      ["Календарь (ICS)", absoluteUrl("/api/v1/calendar.ics")],
      ["Индекс для ИИ", absoluteUrl("/llms.txt")],
    ]),
    home.overdueDeadlines.length > 0 &&
      `## Просроченные дедлайны\n\n${home.overdueDeadlines.map((d) => calendarLine(d, tz)).join("\n")}`,
    `## Ближайшие дедлайны\n\n${home.upcomingDeadlines.map((d) => calendarLine(d, tz)).join("\n") || "Нет."}`,
    `## Ближайшие события\n\n${home.upcomingEvents.map((d) => calendarLine(d, tz)).join("\n") || "Нет."}`,
    `## Предметы\n\n${home.subjects.map((s) => subjectEntry(s)).join("\n")}`,
    home.recentNotes.length > 0 &&
      `## Свежие конспекты\n\n${home.recentNotes.map((n) => noteEntry(n)).join("\n")}`,
  );
}

const subjectEntry = (s: SubjectWithCounts) =>
  entry(
    s.name,
    mdUrl(`/subjects/${s.slug}`),
    [
      s.lecturer && `лектор ${s.lecturer}`,
      s.practiceTeacher && `практика ${s.practiceTeacher}`,
      [
        count(s.labsCount, "лаба", "лабы", "лаб"),
        count(s.notesCount, "конспект", "конспекта", "конспектов"),
        count(s.quizzesCount, "квиз", "квиза", "квизов"),
      ].join(", "),
    ]
      .filter(Boolean)
      .join("; "),
  );

const noteEntry = (n: Note, withSubject = true) =>
  entry(
    withSubject ? `${n.subjectName} — ${n.title}` : n.title,
    mdUrl(notePath(n)),
    sentences([n.lectureDate && fmtDateOnly(n.lectureDate), n.summary]),
  );

const labEntry = (l: Lab, tz: string, withSubject = true) => {
  const d = deadline(l, tz);
  return entry(
    withSubject ? `${l.subjectName} — ${labTitle(l)}` : labTitle(l),
    mdUrl(labPath(l)),
    sentences([d && `дедлайн ${d}`, l.summary]),
  );
};

export async function noteMarkdown(
  subject: string,
  slug: string,
): Promise<string | null> {
  const note = await orNull(getNote(subject, slug));
  if (!note) return null;
  const url = absoluteUrl(notePath(note));
  return doc(
    `# ${note.title}`,
    note.summary && `> ${oneLine(note.summary)}`,
    facts([
      [
        "Предмет",
        link(note.subjectName, mdUrl(`/subjects/${note.subjectSlug}`)),
      ],
      ["Дата занятия", note.lectureDate && fmtDateOnly(note.lectureDate)],
      ["Обновлено", fmtDateYear(note.updatedAt)],
      ["Страница", url],
    ]),
    mdxToMarkdown(note.content, url),
    note.quizzes.length > 0 &&
      `## Квизы для самопроверки\n\n${note.quizzes
        .map((q) =>
          entry(
            q.title,
            `${url}#quiz`,
            `${count(q.questionsCount, "вопрос", "вопроса", "вопросов")}, проходится на странице`,
          ),
        )
        .join("\n")}`,
    (note.prev || note.next) &&
      `## Соседние конспекты\n\n${[
        note.prev &&
          `- Предыдущий: ${link(note.prev.title, mdUrl(notePath(note.prev)))}`,
        note.next &&
          `- Следующий: ${link(note.next.title, mdUrl(notePath(note.next)))}`,
      ]
        .filter(Boolean)
        .join("\n")}`,
  );
}

export async function labMarkdown(
  subject: string,
  slug: string,
): Promise<string | null> {
  const [lab, { tz }] = await Promise.all([
    orNull(getLab(subject, slug)),
    site(),
  ]);
  if (!lab) return null;
  const url = absoluteUrl(labPath(lab));
  const section = (title: string, mdx: string) => {
    const body = mdxToMarkdown(mdx, url);
    return body && `## ${title}\n\n${body}`;
  };
  return doc(
    `# ${labTitle(lab)}`,
    lab.summary && `> ${oneLine(lab.summary)}`,
    facts([
      ["Предмет", link(lab.subjectName, mdUrl(`/subjects/${lab.subjectSlug}`))],
      ["Дедлайн", deadline(lab, tz)],
      ["Максимум баллов", lab.maxScore != null && String(lab.maxScore)],
      ["Преподаватель", lab.teacher || lab.subjectPracticeTeacher],
      ["Обновлено", fmtDateYear(lab.updatedAt, tz)],
      ["Страница", url],
    ]),
    section("Задание", lab.content),
    section("Требования", lab.requirements),
    section("Как сдавать", lab.submission),
    section("Варианты", lab.variants),
    lab.materials.length > 0 &&
      `## Материалы\n\n${lab.materials.map((m) => `- ${link(m.title, m.url)}`).join("\n")}`,
  );
}

export async function subjectMarkdown(slug: string): Promise<string | null> {
  const [data, { tz }] = await Promise.all([orNull(getSubject(slug)), site()]);
  if (!data) return null;
  const { subject, labs, notes, quizzes } = data;
  const url = absoluteUrl(`/subjects/${subject.slug}`);
  return doc(
    `# ${subject.name}`,
    facts([
      ["Лектор", subject.lecturer],
      ["Практика", subject.practiceTeacher],
      ["Страница", url],
    ]),
    mdxToMarkdown(subject.description, url),
    subject.links.length > 0 &&
      `## Ссылки\n\n${subject.links.map((l) => `- ${link(l.title, l.url)}`).join("\n")}`,
    labs.length > 0 &&
      `## Лабораторные\n\n${labs.map((l) => labEntry(l, tz, false)).join("\n")}`,
    notes.length > 0 &&
      `## Конспекты\n\n${notes.map((n) => noteEntry(n, false)).join("\n")}`,
    quizzes.length > 0 &&
      `## Квизы\n\n${quizzes.map((q) => `- ${esc(q.title)} (${count(q.questionsCount, "вопрос", "вопроса", "вопросов")})`).join("\n")}`,
  );
}

export async function pageMarkdown(slug: string): Promise<string | null> {
  const page = await orNull(getPage(slug));
  if (!page) return null;
  return pageDoc(page);
}

function pageDoc(page: Page): string {
  const url = absoluteUrl(`/p/${page.slug}`);
  return doc(
    `# ${page.title}`,
    page.summary && `> ${oneLine(page.summary)}`,
    facts([["Страница", url]]),
    mdxToMarkdown(page.content, url),
  );
}

export async function faqMarkdown(): Promise<string> {
  return faqDoc(await getFAQ());
}

function faqDoc(items: FAQItem[]): string {
  const url = absoluteUrl("/faq");
  const groups = new Map<string, FAQItem[]>();
  for (const it of items) {
    const key = it.category || "Общее";
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }
  return doc(
    "# Частые вопросы",
    facts([["Страница", url]]),
    ...[...groups].map(
      ([category, list]) =>
        `## ${category}\n\n${list
          .map((it) => `### ${it.question}\n\n${mdxToMarkdown(it.answer, url)}`)
          .join("\n\n")}`,
    ),
  );
}

export async function labsMarkdown(): Promise<string> {
  const [labs, { tz }] = await Promise.all([getLabs(), site()]);
  return doc(
    "# Лабораторные работы",
    facts([["Страница", absoluteUrl("/labs")]]),
    labs.map((l) => labEntry(l, tz)).join("\n") || "Пока нет.",
  );
}

export async function notesMarkdown(): Promise<string> {
  const notes = await getNotes();
  return doc(
    "# Конспекты лекций",
    facts([["Страница", absoluteUrl("/notes")]]),
    notes.map((n) => noteEntry(n)).join("\n") || "Пока нет.",
  );
}

export async function subjectsMarkdown(): Promise<string> {
  const subjects = await getSubjects();
  return doc(
    "# Предметы",
    facts([["Страница", absoluteUrl("/subjects")]]),
    subjects.map((s) => subjectEntry(s)).join("\n") || "Пока нет.",
  );
}

/** Index in the llms.txt format (https://llmstxt.org). */
export async function llmsTxt(): Promise<string> {
  const [{ title, description, tz }, subjects, labs, notes, pages] =
    await Promise.all([
      site(),
      getSubjects(),
      getLabs(),
      getNotes(),
      getPages(),
    ]);
  return doc(
    `# ${title}`,
    `> ${oneLine(description)}`,
    [
      `Сайт учебной группы университета ИТМО: лабораторные с дедлайнами, конспекты лекций, квизы, календарь контрольных и сдач. Язык — русский, время — ${tz}.`,
      "Любая публичная страница доступна в Markdown: добавьте `.md` к адресу (главная — `/index.md`) или запросите её с заголовком `Accept: text/markdown`. Все материалы одним файлом — `/llms-full.txt`.",
    ].join("\n\n"),
    `## Разделы\n\n${[
      entry("Главная: дедлайны и события", mdUrl("/")),
      entry("Предметы", mdUrl("/subjects")),
      entry("Лабораторные", mdUrl("/labs")),
      entry("Конспекты", mdUrl("/notes")),
      entry("Частые вопросы", mdUrl("/faq")),
    ].join("\n")}`,
    subjects.length > 0 &&
      `## Предметы\n\n${subjects.map((s) => subjectEntry(s)).join("\n")}`,
    labs.length > 0 &&
      `## Лабораторные\n\n${labs.map((l) => labEntry(l, tz)).join("\n")}`,
    notes.length > 0 &&
      `## Конспекты\n\n${notes.map((n) => noteEntry(n)).join("\n")}`,
    pages.length > 0 &&
      `## Страницы\n\n${pages.map((p) => entry(p.title, mdUrl(`/p/${p.slug}`), p.summary)).join("\n")}`,
    `## Optional\n\n${[
      entry("Все материалы одним файлом", absoluteUrl("/llms-full.txt")),
      entry(
        "Календарь (ICS)",
        absoluteUrl("/api/v1/calendar.ics"),
        "дедлайны, контрольные, экзамены и сдачи",
      ),
      entry(
        "Публичное REST API (OpenAPI)",
        absoluteUrl("/api/v1/openapi.yaml"),
        `JSON, без авторизации; документация — ${absoluteUrl("/api/v1/docs")}`,
      ),
      entry("Карта сайта", absoluteUrl("/sitemap.xml")),
    ].join("\n")}`,
  );
}

/** Every published note, lab, page and the FAQ in one document. */
export async function llmsFullTxt(): Promise<string> {
  const [{ title, description }, labs, notes, pages, faq] = await Promise.all([
    site(),
    getLabs(),
    getNotes(),
    getPages(),
    getFAQ(),
  ]);
  // Списки приходят без текста: полные версии по одной, они в Data Cache.
  const [labDocs, noteDocs, pageDocs] = await Promise.all([
    Promise.all(labs.map((l) => labMarkdown(l.subjectSlug, l.slug))),
    Promise.all(notes.map((n) => noteMarkdown(n.subjectSlug, n.slug))),
    Promise.all(pages.map((p) => pageMarkdown(p.slug))),
  ]);
  const part = (heading: string, docs: (string | null)[]) => {
    const body = docs
      .filter((d): d is string => !!d)
      .map((d) => demote(d, 2))
      .join("\n\n---\n\n");
    return body && `## ${heading}\n\n${body}`;
  };
  return doc(
    `# ${title}`,
    `> ${oneLine(description)}`,
    `Полный текст публичных материалов ${absoluteUrl("/")}. Индекс — ${absoluteUrl("/llms.txt")}.`,
    part("Лабораторные", labDocs),
    part("Конспекты", noteDocs),
    part("Страницы", pageDocs),
    faq.length > 0 && demote(faqDoc(faq), 1),
  );
}

/**
 * Shifts headings `by` levels down (at most `######`) so documents nest under
 * the sections of llms-full.txt. Fenced code is left alone: `# комментарий`
 * в Python — не заголовок.
 */
function demote(md: string, by: number): string {
  let fence: string | null = null;
  return md
    .split("\n")
    .map((line) => {
      const f = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      if (f && (!fence || f.startsWith(fence))) {
        fence = fence ? null : f;
        return line;
      }
      if (fence) return line;
      return line.replace(
        /^(#{1,6}) /,
        (_, h: string) => `${"#".repeat(Math.min(6, h.length + by))} `,
      );
    })
    .join("\n")
    .trim();
}
