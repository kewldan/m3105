import { run } from "@mdx-js/mdx";
import type { MDXContent } from "mdx/types";
import type { ReactNode } from "react";
import * as runtime from "react/jsx-runtime";

import { mdxComponents } from "@/components/mdx/components";

import {
  type CompiledMdx,
  compileCached,
  compileMdx,
  mdxKey,
  type TocItem,
} from "./compile";

export type { TocItem };

export type RenderedMdx = {
  content: ReactNode;
  toc: TocItem[];
  error: string | null;
};

type Ready = {
  Content: MDXContent | null;
  toc: TocItem[];
  error: string | null;
};

/** Turns compiled code into a component; the runtime is this bundle's React. */
async function load({ code, toc, error }: CompiledMdx): Promise<Ready> {
  if (error) return { Content: null, toc, error };
  try {
    const { default: Content } = await run(code, { ...runtime });
    return { Content, toc, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { Content: null, toc, error: message };
  }
}

/**
 * Готовые компоненты читаемых сейчас текстов. Сжатый код из `compile.ts`
 * есть для всех, но распаковать и разобрать пару мегабайт JS на каждый
 * запрос — десятки миллисекунд; горячие тексты держим уже разобранными.
 */
type ReadyEntry = { result: Promise<Ready>; size: number };
type ReadyCache = { entries: Map<string, ReadyEntry>; size: number };
const CACHE_KEY = Symbol.for("edu3105.mdx-ready");
/** Символов кода: средний конспект — 1,4 млн, с формулами — до 7 млн. */
const CACHE_BUDGET = 24_000_000;

function readyCache(): ReadyCache {
  const store = globalThis as { [CACHE_KEY]?: ReadyCache };
  store[CACHE_KEY] ??= { entries: new Map(), size: 0 };
  return store[CACHE_KEY];
}

function ready(source: string): Promise<Ready> {
  const cache = readyCache();
  const key = mdxKey(source);
  const hit = cache.entries.get(key);
  if (hit) {
    cache.entries.delete(key);
    cache.entries.set(key, hit);
    return hit.result;
  }
  let size = 0;
  const entry: ReadyEntry = {
    result: compileCached(source).then((compiled) => {
      size = compiled.code.length;
      return load(compiled);
    }),
    size: 0,
  };
  cache.entries.set(key, entry);
  void entry.result.then(() => {
    if (cache.entries.get(key) !== entry) return;
    entry.size = size;
    cache.size += size;
    for (const [old, other] of cache.entries) {
      if (cache.size <= CACHE_BUDGET || other === entry) break;
      cache.entries.delete(old);
      cache.size -= other.size;
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
    ? ready(source)
    : compileMdx(source).then(load));
  return {
    content: Content ? <Content components={mdxComponents} /> : null,
    // Копия: массив из кеша общий для всех запросов.
    toc: [...toc],
    error,
  };
}
