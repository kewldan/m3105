import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

import { compile } from "@mdx-js/mdx";
import type { Element, ElementContent, Root } from "hast";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

/**
 * Компиляция MDX в код компонента и кеш этого кода. Без React и компонентов
 * сайта: модуль грузится и из страниц, и из прогрева при старте сервера.
 */

export type TocItem = { id: string; text: string; depth: 2 | 3 };

const prettyCode: PrettyCodeOptions = {
  theme: { light: "github-light", dark: "github-dark" },
  keepBackground: false,
  defaultLang: "plaintext",
};

/** Collects h2/h3 headings (after rehype-slug assigned ids). */
function rehypeToc(toc: TocItem[]) {
  return () => (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;
      const id = node.properties?.id;
      if (typeof id !== "string") return;
      const text = extractText(node);
      if (text) toc.push({ id, text, depth: node.tagName === "h2" ? 2 : 3 });
    });
  };
}

/**
 * Чек-листы GFM (`- [ ] …`): чекбокс выносится в начало пункта, остальное
 * оборачивается в div, а текст пункта становится ключом отметки (TaskCheckbox).
 */
function rehypeTaskList() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      const cls = node.properties?.className;
      if (!Array.isArray(cls)) return;
      if (cls.includes("contains-task-list")) {
        node.properties.className = [
          ...cls,
          "list-none",
          "pl-0",
          "[li_&]:pl-6.5",
        ];
        return;
      }
      if (!cls.includes("task-list-item")) return;
      const input = takeCheckbox(node);
      if (!input) return;
      // Вложенные списки идут под строкой пункта: иначе отметка родителя
      // зачеркнула бы их, а их текст попал бы в ключ.
      const isList = (c: ElementContent) =>
        c.type === "element" && (c.tagName === "ul" || c.tagName === "ol");
      const own = node.children.filter((c) => !isList(c));
      const lists = node.children.filter(isList);
      const text = own.map(extractText).join("").replace(/\s+/g, " ").trim();
      input.properties = { ...input.properties, dataTask: text };
      node.properties.className = [...cls, "pl-0"];
      node.children = [
        {
          type: "element",
          tagName: "div",
          properties: {
            className: [
              "flex",
              "items-start",
              "gap-2.5",
              "[&:has(>[data-checked])>div]:text-muted-foreground",
              "[&:has(>[data-checked])>div]:line-through",
            ],
          },
          children: [
            input,
            {
              type: "element",
              tagName: "div",
              properties: {
                className: [
                  "min-w-0",
                  "flex-1",
                  "[&>p:first-child]:mt-0",
                  "[&>p:last-child]:mb-0",
                ],
              },
              children: own,
            },
          ],
        },
        ...lists,
      ];
    });
  };
}

/** Removes the leading checkbox from a list item (or its first paragraph). */
function takeCheckbox(li: Element): Element | null {
  const isBox = (c: ElementContent): c is Element =>
    c.type === "element" && c.tagName === "input";
  const first = li.children.find(
    (c) => c.type !== "text" || c.value.trim() !== "",
  );
  const parent =
    first?.type === "element" && first.tagName === "p" ? first : li;
  const index = parent.children.findIndex(isBox);
  if (index === -1) return null;
  const [input] = parent.children.splice(index, 1);
  const next = parent.children[index];
  if (next?.type === "text") next.value = next.value.replace(/^\s+/, "");
  return input as Element;
}

function extractText(node: {
  children?: unknown[];
  value?: string;
  type: string;
}): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? [])
    .map((c) =>
      extractText(c as { children?: unknown[]; value?: string; type: string }),
    )
    .join("");
}

export type CompiledMdx = {
  /** Function body for `run` from @mdx-js/mdx; empty when the source is broken. */
  code: string;
  toc: TocItem[];
  error: string | null;
};

/**
 * The slow half: remark, rehype, shiki and KaTeX turn the source into code.
 * Never rejects — a broken source is a result with `error`.
 */
export async function compileMdx(source: string): Promise<CompiledMdx> {
  const toc: TocItem[] = [];
  try {
    const file = await compile(source, {
      outputFormat: "function-body",
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [
        rehypeSlug,
        rehypeTaskList,
        rehypeToc(toc),
        rehypeKatex,
        [rehypePrettyCode, prettyCode],
      ],
      development: false,
    });
    return { code: String(file), toc, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: "", toc, error: message };
  }
}

/**
 * Кеш скомпилированного кода. Компиляция конспекта — секунды процессора на
 * боевом сервере, и пока она идёт, сервер не отвечает остальным; текст же
 * меняется редко. Код большой (все конспекты — под сотню миллионов символов),
 * но однообразный, поэтому лежит сжатым: gzip ужимает его раз в десять.
 * Ключ — хеш исходника: правка в админке даёт новый ключ, сбрасывать нечего.
 * На globalThis, чтобы кеш был один на все серверные бандлы.
 */
type Packed = { gz: Buffer; toc: TocItem[]; error: string | null };
type PackedEntry = { result: Promise<Packed>; bytes: number };
type CodeCache = { entries: Map<string, PackedEntry>; bytes: number };
const CACHE_KEY = Symbol.for("edu3105.mdx-code");
/** Сжатых байт: с запасом на все тексты сайта и их прошлые редакции. */
const CACHE_BYTES = 64 * 1024 * 1024;

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function codeCache(): CodeCache {
  const store = globalThis as { [CACHE_KEY]?: CodeCache };
  store[CACHE_KEY] ??= { entries: new Map(), bytes: 0 };
  return store[CACHE_KEY];
}

/** Cache key of a source. */
export function mdxKey(source: string): string {
  return createHash("sha256").update(source).digest("base64");
}

async function pack(source: string): Promise<Packed> {
  const { code, toc, error } = await compileMdx(source);
  return { gz: await gzipAsync(code), toc, error };
}

/** Compiled code of a source: from the cache, compiling on a miss. */
export async function compileCached(source: string): Promise<CompiledMdx> {
  const cache = codeCache();
  const key = mdxKey(source);
  let entry = cache.entries.get(key);
  if (entry) {
    // Map помнит порядок вставки: свежие — в конце, вытесняются с начала.
    cache.entries.delete(key);
    cache.entries.set(key, entry);
  } else {
    // В кеше лежит промис: одновременные запросы ждут одну компиляцию.
    const fresh: PackedEntry = { result: pack(source), bytes: 0 };
    entry = fresh;
    cache.entries.set(key, fresh);
    void fresh.result.then((packed) => {
      if (cache.entries.get(key) !== fresh) return;
      fresh.bytes = packed.gz.length;
      cache.bytes += fresh.bytes;
      for (const [old, other] of cache.entries) {
        if (cache.bytes <= CACHE_BYTES || other === fresh) break;
        cache.entries.delete(old);
        cache.bytes -= other.bytes;
      }
    });
  }
  const { gz, toc, error } = await entry.result;
  return { code: (await gunzipAsync(gz)).toString(), toc, error };
}
