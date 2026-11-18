import { compile, run } from "@mdx-js/mdx";
import type { Element, ElementContent, Root } from "hast";
import type { MDXContent } from "mdx/types";
import type { ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";

import { mdxComponents } from "@/components/mdx/components";

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

export type RenderedMdx = {
  content: ReactNode;
  toc: TocItem[];
  error: string | null;
};

type Compiled = {
  Content: MDXContent | null;
  toc: TocItem[];
  error: string | null;
  /** Length of the compiled code: what the entry costs in the cache. */
  size: number;
};

/**
 * The slow half: remark, rehype, shiki and KaTeX turn the source into a
 * component. Never rejects — a broken source is a result with `error`.
 */
async function compileMdx(source: string): Promise<Compiled> {
  const toc: TocItem[] = [];
  try {
    const code = String(
      await compile(source, {
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
      }),
    );
    const { default: Content } = await run(code, { ...runtime });
    return { Content, toc, error: null, size: code.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { Content: null, toc, error: message, size: message.length };
  }
}

/**
 * Скомпилированный MDX по исходнику. Компиляция конспекта — сотни
 * миллисекунд процессора, и пока она идёт, сервер не отвечает остальным;
 * текст же меняется редко, поэтому результат живёт в памяти процесса.
 * Ключ — сам исходник: правка в админке даёт новый ключ, сбрасывать нечего.
 * На globalThis, чтобы кеш был один на все серверные бандлы.
 */
type CacheEntry = { result: Promise<Compiled>; size: number };
type MdxCache = { entries: Map<string, CacheEntry>; size: number };
const CACHE_KEY = Symbol.for("edu3105.mdx-cache");
/** Символов скомпилированного кода: конспект с формулами — до 2–3 млн. */
const CACHE_BUDGET = 24_000_000;

function mdxCache(): MdxCache {
  const store = globalThis as { [CACHE_KEY]?: MdxCache };
  store[CACHE_KEY] ??= { entries: new Map(), size: 0 };
  return store[CACHE_KEY];
}

function compileCached(source: string): Promise<Compiled> {
  const cache = mdxCache();
  const hit = cache.entries.get(source);
  if (hit) {
    // Map помнит порядок вставки: свежие — в конце, вытесняются с начала.
    cache.entries.delete(source);
    cache.entries.set(source, hit);
    return hit.result;
  }
  // В кеше лежит промис: одновременные запросы ждут одну компиляцию.
  const entry: CacheEntry = { result: compileMdx(source), size: 0 };
  cache.entries.set(source, entry);
  void entry.result.then((compiled) => {
    if (cache.entries.get(source) !== entry) return;
    entry.size = compiled.size;
    cache.size += compiled.size;
    for (const [key, old] of cache.entries) {
      if (cache.size <= CACHE_BUDGET || old === entry) break;
      cache.entries.delete(key);
      cache.size -= old.size;
    }
  });
  return entry.result;
}

/**
 * Compiles and renders MDX on the server. Errors in the source are reported
 * as a message instead of crashing the page. `cache: false` — for drafts
 * typed in the editor, which would only push real pages out of the cache.
 */
export async function renderMdx(
  source: string,
  { cache = true }: { cache?: boolean } = {},
): Promise<RenderedMdx> {
  if (!source?.trim()) {
    return { content: null, toc: [], error: null };
  }
  const { Content, toc, error } = await (cache
    ? compileCached(source)
    : compileMdx(source));
  return {
    content: Content ? <Content components={mdxComponents} /> : null,
    // Копия: массив из кеша общий для всех запросов.
    toc: [...toc],
    error,
  };
}
