import { compileCached } from "./compile";

/**
 * Прогрев кеша MDX при старте сервера. Деплой поднимает новый процесс с
 * пустым кешем, и первый читатель каждого конспекта ждал бы компиляцию —
 * секунды. Здесь тексты компилируются заранее, свежие первыми.
 */

type Item = Record<string, unknown>;

const API = `${(process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "")}/api/v1`;
/** API стартует рядом с фронтом и может быть ещё не готов. */
const ATTEMPTS = 10;
const RETRY_MS = 6000;
/** Даём серверу подняться и ответить на первые запросы. */
const START_DELAY_MS = 5000;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** Newest first: what was written last is what gets read. */
function byUpdated(items: Item[]): Item[] {
  return [...items].sort((a, b) =>
    String(a.updatedAt) < String(b.updatedAt) ? 1 : -1,
  );
}

const seg = (value: unknown) => encodeURIComponent(String(value));

/** Fetches one document and returns the MDX strings it holds. */
type Loader = () => Promise<unknown[]>;

/**
 * Что рендерят публичные страницы, самое нужное первым. Списки API отдают
 * записи без текста, поэтому каждый документ запрашивается отдельно —
 * по одному, прямо перед своей компиляцией.
 */
async function loaders(): Promise<Loader[]> {
  const [notes, labs, pages, quizzes] = await Promise.all([
    get<Item[]>("/notes"),
    get<Item[]>("/labs"),
    get<Item[]>("/pages"),
    get<Item[]>("/quizzes"),
  ]);
  return [
    ...byUpdated(notes).map((n) => async () => {
      const note = await get<Item>(
        `/notes/${seg(n.subjectSlug)}/${seg(n.slug)}`,
      );
      return [note.content];
    }),
    ...byUpdated(labs).map((l) => async () => {
      const lab = await get<Item>(`/labs/${seg(l.subjectSlug)}/${seg(l.slug)}`);
      return [lab.content, lab.requirements, lab.submission, lab.variants];
    }),
    ...pages.map((p) => async () => {
      const page = await get<Item>(`/pages/${seg(p.slug)}`);
      return [page.content];
    }),
    // Вопросы квизов под конспектами: короткие, но их сотни — в конце.
    ...byUpdated(quizzes).map((q) => async () => {
      const quiz = await get<{ questions?: Item[] }>(`/quizzes/${seg(q.slug)}`);
      return (quiz.questions ?? []).flatMap((x) => [x.prompt, x.explanation]);
    }),
  ];
}

async function whenReady<T>(load: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (err) {
      if (attempt >= ATTEMPTS) throw err;
      await sleep(RETRY_MS);
    }
  }
}

/** Compiles everything into the cache. Never throws: a warm-up is optional. */
export async function warmMdxCache(): Promise<void> {
  try {
    await sleep(START_DELAY_MS);
    const started = Date.now();
    const seen = new Set<string>();
    for (const load of await whenReady(loaders)) {
      // Один документ не открылся — остальные всё равно прогреваем.
      for (const text of await load().catch(() => [])) {
        if (typeof text !== "string" || !text.trim() || seen.has(text))
          continue;
        seen.add(text);
        const at = Date.now();
        await compileCached(text);
        // Компиляция занимает процессор целиком: после каждого текста столько
        // же отдыхаем, чтобы запросы читателей не ждали всю очередь.
        await sleep(Date.now() - at);
      }
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    console.info(`[mdx] кеш прогрет: ${seen.size} текстов за ${seconds} с`);
  } catch (err) {
    console.warn("[mdx] прогрев кеша не удался:", err);
  }
}
