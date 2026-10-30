#!/usr/bin/env bun
/**
 * Компилирует MDX-файлы тем же пайплайном, что и сайт (remark-gfm,
 * remark-math, rehype-katex в строгом режиме), и сообщает об ошибках
 * разметки, формул и о формулах в заголовках, которые ломают оглавление.
 *
 *   bun apps/web/scripts/check-mdx.ts file.mdx [...]
 *
 * Шапка `--- … ---` в начале файла пропускается. Код выхода 1, если хотя бы
 * один файл не скомпилировался.
 */
import { readFileSync } from "node:fs";
import { evaluate } from "@mdx-js/mdx";
import { createElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const Passthrough = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children);
const components = {
  Callout: Passthrough,
  Spoiler: Passthrough,
  Steps: Passthrough,
  Badge: Passthrough,
  Level: Passthrough,
  Tags: Passthrough,
  Meta: Passthrough,
  Cards: Passthrough,
  Card: Passthrough,
  Matcher: Passthrough,
};

function stripFrontmatter(src: string): string {
  if (!src.startsWith("---\n")) return src;
  const end = src.indexOf("\n---\n", 4);
  return end === -1 ? src : src.slice(end + 5);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function check(file: string): Promise<boolean> {
  const src = stripFrontmatter(readFileSync(file, "utf8"));
  try {
    const { default: MDXContent } = await evaluate(src, {
      ...runtime,
      remarkPlugins: [remarkGfm, remarkMath],
      // rehype-katex не бросает исключений: ошибку формулы он кладёт в
      // сообщения VFile и рисует <span class="katex-error">, поэтому её ищем
      // в готовом HTML.
      rehypePlugins: [rehypeSlug, [rehypeKatex, { strict: true }]],
      development: false,
    });
    const html = renderToStaticMarkup(
      createElement(MDXContent, { components }),
    );
    const headings = [...html.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/g)].map(
      (m) => m[1],
    );
    const mathHeadings = headings
      .filter((h) => h.includes("katex"))
      .map((h) => h.replace(/<[^>]+>/g, ""));
    const mathErrors = [
      ...html.matchAll(/<span class="katex-error"[^>]*title="([^"]*)"[^>]*>/g),
    ].map((m) => decodeEntities(m[1]).replace(/\s+/g, " ").slice(0, 160));
    const noSources = !/<h2[^>]*>(Источники|Литература)<\/h2>/.test(html);
    const ok =
      mathErrors.length === 0 && mathHeadings.length === 0 && noSources;
    console.log(
      `${ok ? "OK" : "FAIL"} ${file}: ${src.length} символов, заголовков h2/h3: ${headings.length}`,
    );
    for (const err of mathErrors) {
      console.log(`  ОШИБКА В ФОРМУЛЕ: ${err}`);
    }
    if (mathHeadings.length > 0) {
      console.log(`  ФОРМУЛЫ В ЗАГОЛОВКАХ: ${mathHeadings.join(" | ")}`);
    }
    if (!noSources) {
      console.log(
        "  РАЗДЕЛ «Источники/Литература» — в конспектах его не должно быть",
      );
    }
    return ok;
  } catch (e) {
    console.log(`FAIL ${file}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Укажите хотя бы один .mdx файл");
  process.exit(2);
}
let ok = true;
for (const f of files) {
  ok = (await check(f)) && ok;
}
process.exit(ok ? 0 : 1);
