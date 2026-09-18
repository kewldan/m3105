#!/usr/bin/env bun
/**
 * Конспекты и квизы сайта из файлов через админский API.
 *
 *   bun scripts/content.ts notes list [--subject <slug>]
 *   bun scripts/content.ts note pull <subject>/<slug> [--out file.mdx]
 *   bun scripts/content.ts note push <file.mdx> [--status draft|published]
 *   bun scripts/content.ts quiz push <file.json> [--status draft|published]
 *   bun scripts/content.ts file push <file> [...]
 *   bun scripts/content.ts mdx check <file.mdx> [...]
 *
 * Формат файлов — docs/note-format.md и docs/quiz-format.md. Конспект
 * находится по `slug` из шапки: если он есть, конспект обновляется, иначе
 * создаётся, а выданный сервером слаг дописывается в шапку. Квиз так же
 * находится по `slug` в JSON.
 *
 * Картинки и файлы, на которые конспект ссылается относительным путём
 * (`![Доска](./board.jpg)`), при `note push` заливаются в хранилище сайта, и на
 * сервер уходит текст с их адресами; локальный файл не меняется. Повторная
 * заливка того же файла отдаёт уже сохранённый, так что push идемпотентен.
 *
 * Адрес сайта — `--api`, иначе SITE_URL, иначе https://m3105.ru. Авторизация —
 * ADMIN_API_TOKEN (Bearer, без входа) или ADMIN_PASSWORD (вход по паролю, кука
 * кэшируется в ~/.cache/edu3105); оба берутся из окружения или из .env в корне.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

type Flags = Record<string, string | true>;
const positional: string[] = [];
const flags: Flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const next = process.argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[a.slice(2)] = next;
      i++;
    } else {
      flags[a.slice(2)] = true;
    }
  } else {
    positional.push(a);
  }
}
const flag = (name: string): string | undefined =>
  typeof flags[name] === "string" ? (flags[name] as string) : undefined;

function loadDotEnv(): void {
  const file = resolve(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const SITE = (
  flag("api") ??
  process.env.SITE_URL ??
  "https://m3105.ru"
).replace(/\/$/, "");
const API = `${SITE}/api/v1`;

// Сессия админки живёт 30 дней, а вход ограничен по числу попыток, поэтому
// кука кэшируется между запусками.
const SESSION_FILE = resolve(
  process.env.XDG_CACHE_HOME ?? resolve(homedir(), ".cache"),
  "edu3105",
  `session-${new URL(SITE).host}`,
);

// С ADMIN_API_TOKEN вход не нужен: админские запросы идут с Bearer-заголовком.
const API_TOKEN = process.env.ADMIN_API_TOKEN ?? "";

let cookie =
  API_TOKEN === "" && existsSync(SESSION_FILE)
    ? readFileSync(SESSION_FILE, "utf8").trim()
    : "";
let loggedIn = API_TOKEN !== "" || cookie !== "";

type Json = Record<string, unknown>;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T = Json>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN
        ? { Authorization: `Bearer ${API_TOKEN}` }
        : { Cookie: cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && !API_TOKEN) {
    cookie = setCookie.split(";")[0];
    mkdirSync(resolve(SESSION_FILE, ".."), { recursive: true });
    writeFileSync(SESSION_FILE, cookie, { mode: 0o600 });
  }
  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(
      res.status,
      `${method} ${path} → ${res.status}: ${text}`,
    );
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function login(): Promise<void> {
  if (API_TOKEN) {
    throw new Error(
      "ADMIN_API_TOKEN не принят сервером (401): проверьте токен",
    );
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("Нет ADMIN_PASSWORD ни в окружении, ни в .env");
  }
  cookie = "";
  await call("POST", "/auth/login", { password });
  loggedIn = true;
}

async function admin<T = Json>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!loggedIn) await login();
  try {
    return await call<T>(method, path, body);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    await login(); // кэшированная сессия протухла
    return call<T>(method, path, body);
  }
}

// ---------- files ----------

type Attachment = {
  id: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
};

/** Uploads a file to the admin file storage (multipart, not JSON). */
async function uploadFile(path: string): Promise<Attachment> {
  if (!loggedIn) await login();
  const send = async () => {
    const form = new FormData();
    form.append("file", Bun.file(path), basename(path));
    const res = await fetch(`${API}/admin/files`, {
      method: "POST",
      headers: API_TOKEN
        ? { Authorization: `Bearer ${API_TOKEN}` }
        : { Cookie: cookie },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(
        res.status,
        `POST /admin/files ${basename(path)} → ${res.status}: ${text}`,
      );
    }
    return JSON.parse(text) as Attachment;
  };
  try {
    return await send();
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    await login(); // кэшированная сессия протухла
    return send();
  }
}

const markdownFor = (a: Attachment) =>
  a.contentType.startsWith("image/")
    ? `![${a.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "")}](${a.url})`
    : `[${a.name.replace(/[[\]]/g, "")}](${a.url})`;

/** Markdown-ссылка или картинка: `[текст](адрес "заголовок")`. */
const LINK = /(!?\[[^\]]*\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g;

/**
 * Uploads files the text links to by a relative path and returns the text with
 * their site addresses. Links to pages and missing files stay as they are.
 */
async function uploadLocalLinks(
  text: string,
  baseDir: string,
): Promise<string> {
  const urls = new Map<string, string>();
  for (const m of text.matchAll(LINK)) {
    const raw = m[2].replace(/^<|>$/g, "");
    if (urls.has(raw) || /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(raw)) continue;
    let file: string;
    try {
      file = resolve(baseDir, decodeURI(raw));
    } catch {
      continue;
    }
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const a = await uploadFile(file);
    urls.set(raw, a.url);
    console.log(`  ↑ ${raw} → ${a.url}`);
  }
  if (urls.size === 0) return text;
  return text.replace(
    LINK,
    (all, head: string, target: string, tail: string) => {
      const url = urls.get(target.replace(/^<|>$/g, ""));
      return url ? `${head}${url}${tail}` : all;
    },
  );
}

async function filePush(): Promise<void> {
  const files = positional.slice(2);
  if (files.length === 0) throw new Error("Укажите файлы");
  for (const f of files) {
    const a = await uploadFile(f);
    console.log(`✓ ${f} → ${SITE}${a.url}\n  ${markdownFor(a)}`);
  }
}

type Subject = { id: number; slug: string; name: string; shortName: string };
type Note = {
  id: number;
  subjectId: number;
  number: number;
  slug: string;
  title: string;
  summary: string;
  content: string;
  lectureDate: string | null;
  status: string;
  quizzesCount?: number;
};
type Quiz = {
  id: number;
  subjectId: number | null;
  noteId: number | null;
  slug: string;
  title: string;
  status: string;
  questions?: unknown[];
};

const asList = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { items?: T[] }).items ?? []);

async function subjects(): Promise<Subject[]> {
  return asList<Subject>(await call("GET", "/subjects"));
}

async function subjectBySlug(slug: string): Promise<Subject> {
  const s = (await subjects()).find((x) => x.slug === slug);
  if (!s) throw new Error(`Предмет «${slug}» не найден`);
  return s;
}

async function allNotes(): Promise<Note[]> {
  return asList<Note>(await admin("GET", "/admin/notes"));
}

async function allQuizzes(): Promise<Quiz[]> {
  return asList<Quiz>(await admin("GET", "/admin/quizzes"));
}

// ---------- frontmatter ----------

type Frontmatter = Record<string, string>;

function splitFrontmatter(src: string): { meta: Frontmatter; body: string } {
  if (!src.startsWith("---\n")) return { meta: {}, body: src };
  const end = src.indexOf("\n---\n", 4);
  if (end === -1) return { meta: {}, body: src };
  const meta: Frontmatter = {};
  for (const line of src.slice(4, end).split("\n")) {
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body: src.slice(end + 5) };
}

function joinFrontmatter(meta: Frontmatter, body: string): string {
  const order = [
    "subject",
    "number",
    "slug",
    "title",
    "summary",
    "lectureDate",
    "status",
  ];
  const keys = [
    ...order.filter((k) => meta[k] !== undefined),
    ...Object.keys(meta).filter((k) => !order.includes(k)),
  ];
  return `---\n${keys.map((k) => `${k}: ${meta[k]}`).join("\n")}\n---\n${body}`;
}

// ---------- commands ----------

async function notesList(): Promise<void> {
  const subj = await subjects();
  const byId = new Map(subj.map((s) => [s.id, s]));
  let notes = await allNotes();
  const only = flag("subject");
  if (only) notes = notes.filter((n) => byId.get(n.subjectId)?.slug === only);
  notes.sort(
    (a, b) =>
      (byId.get(a.subjectId)?.id ?? 0) - (byId.get(b.subjectId)?.id ?? 0) ||
      a.number - b.number,
  );
  for (const n of notes) {
    const s = byId.get(n.subjectId);
    console.log(
      `${String(n.id).padStart(3)}  ${(s?.shortName ?? "?").padEnd(10)} ${String(n.number).padStart(2)}  ${n.status.padEnd(9)} ${n.lectureDate ?? "----------"}  ${s?.slug ?? "?"}/${n.slug}  |  ${n.title}  |  квизов: ${n.quizzesCount ?? "?"}`,
    );
  }
}

async function notePull(): Promise<void> {
  const ref = positional[2];
  if (!ref?.includes("/")) {
    throw new Error("Укажите конспект как <subject>/<slug>");
  }
  const [subjectSlug, slug] = ref.split("/");
  const s = await subjectBySlug(subjectSlug);
  const note = (await allNotes()).find(
    (n) => n.subjectId === s.id && n.slug === slug,
  );
  if (!note) throw new Error(`Конспект ${ref} не найден`);
  const full = await admin<Note>("GET", `/admin/notes/${note.id}`);
  const meta: Frontmatter = {
    subject: s.slug,
    number: String(full.number),
    slug: full.slug,
    title: full.title,
    summary: full.summary,
    lectureDate: full.lectureDate ?? "",
    status: full.status,
  };
  const out = flag("out") ?? `${full.slug}.mdx`;
  writeFileSync(out, joinFrontmatter(meta, full.content));
  console.log(`✓ ${out} (${full.content.length} символов)`);
}

async function mdxCheck(files: string[]): Promise<boolean> {
  if (files.length === 0) throw new Error("Укажите .mdx файлы");
  const proc = Bun.spawn(
    [
      "bun",
      resolve(ROOT, "apps/web/scripts/check-mdx.ts"),
      ...files.map((f) => resolve(f)),
    ],
    { cwd: ROOT, stdout: "inherit", stderr: "inherit" },
  );
  return (await proc.exited) === 0;
}

async function notePush(): Promise<void> {
  const file = positional[2];
  if (!file) throw new Error("Укажите .mdx файл");
  const { meta, body } = splitFrontmatter(readFileSync(file, "utf8"));
  for (const k of ["subject", "title", "summary"]) {
    if (!meta[k]) throw new Error(`В шапке ${file} нет поля ${k}`);
  }
  if (!(await mdxCheck([file]))) {
    throw new Error("MDX не прошёл проверку, публикация отменена");
  }
  const s = await subjectBySlug(meta.subject);
  const notes = (await allNotes()).filter((n) => n.subjectId === s.id);
  const existing = meta.slug
    ? notes.find((n) => n.slug === meta.slug)
    : undefined;
  const status = flag("status") ?? meta.status ?? "draft";
  const number = meta.number
    ? Number(meta.number)
    : (existing?.number ??
      (notes.length ? Math.max(...notes.map((n) => n.number)) + 1 : 1));
  const input = {
    subjectId: s.id,
    number,
    slug: meta.slug || undefined,
    title: meta.title,
    summary: meta.summary,
    content: (await uploadLocalLinks(body, dirname(resolve(file)))).trimEnd(),
    lectureDate: meta.lectureDate || null,
    status,
  };
  const saved = existing
    ? await admin<Note>("PUT", `/admin/notes/${existing.id}`, input)
    : await admin<Note>("POST", "/admin/notes", input);
  if (
    !meta.slug ||
    meta.number !== String(saved.number) ||
    meta.status !== status
  ) {
    writeFileSync(
      file,
      joinFrontmatter(
        {
          ...meta,
          slug: saved.slug,
          number: String(saved.number),
          status,
        },
        body,
      ),
    );
  }
  console.log(
    `✓ ${existing ? "обновлён" : "создан"} конспект #${saved.id} [${status}]: ${SITE}/notes/${s.slug}/${saved.slug}`,
  );
}

async function quizPush(): Promise<void> {
  const file = positional[2];
  if (!file) throw new Error("Укажите .json файл квиза");
  const quiz = JSON.parse(readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  const subjectSlug = quiz.subjectSlug as string | undefined;
  const noteSlug = quiz.noteSlug as string | undefined;
  if (!subjectSlug || !noteSlug) {
    throw new Error("В квизе нужны subjectSlug и noteSlug");
  }
  const s = await subjectBySlug(subjectSlug);
  const note = (await allNotes()).find(
    (n) => n.subjectId === s.id && n.slug === noteSlug,
  );
  if (!note) throw new Error(`Конспект ${subjectSlug}/${noteSlug} не найден`);
  const questions = quiz.questions;
  const validated = await admin<{ questions: unknown[] }>(
    "POST",
    "/admin/quizzes/validate",
    { questions },
  );
  const status =
    flag("status") ?? (quiz.status as string | undefined) ?? "draft";
  const input = {
    subjectId: s.id,
    noteId: note.id,
    slug: (quiz.slug as string | undefined) || undefined,
    title: quiz.title,
    description: quiz.description ?? "",
    questions: validated.questions ?? questions,
    shuffleQuestions: quiz.shuffleQuestions ?? true,
    shuffleOptions: quiz.shuffleOptions ?? true,
    status,
  };
  const existing = quiz.slug
    ? (await allQuizzes()).find((q) => q.slug === quiz.slug)
    : undefined;
  const saved = existing
    ? await admin<Quiz>("PUT", `/admin/quizzes/${existing.id}`, input)
    : await admin<Quiz>("POST", "/admin/quizzes", input);
  if (quiz.slug !== saved.slug || quiz.status !== status) {
    writeFileSync(
      file,
      `${JSON.stringify({ ...quiz, slug: saved.slug, status }, null, 2)}\n`,
    );
  }
  console.log(
    `✓ ${existing ? "обновлён" : "создан"} квиз #${saved.id} [${status}] «${saved.title}», вопросов: ${(saved.questions ?? []).length} → ${SITE}/notes/${s.slug}/${note.slug}`,
  );
}

const usage = `Использование:
  bun scripts/content.ts notes list [--subject <slug>]
  bun scripts/content.ts note pull <subject>/<slug> [--out file.mdx]
  bun scripts/content.ts note push <file.mdx> [--status draft|published]
  bun scripts/content.ts quiz push <file.json> [--status draft|published]
  bun scripts/content.ts file push <file> [...]
  bun scripts/content.ts mdx check <file.mdx> [...]`;

try {
  const cmd = `${positional[0] ?? ""} ${positional[1] ?? ""}`.trim();
  switch (cmd) {
    case "notes list":
      await notesList();
      break;
    case "note pull":
      await notePull();
      break;
    case "note push":
      await notePush();
      break;
    case "quiz push":
      await quizPush();
      break;
    case "file push":
      await filePush();
      break;
    case "mdx check":
      process.exit((await mdxCheck(positional.slice(2))) ? 0 : 1);
      break;
    default:
      console.log(usage);
      process.exit(2);
  }
} catch (e) {
  console.error(`Ошибка: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
