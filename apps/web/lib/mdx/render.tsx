import { evaluate } from "@mdx-js/mdx";
import type { Element, ElementContent, Root } from "hast";
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

/**
 * Compiles and renders MDX on the server. Errors in the source are reported
 * as a message instead of crashing the page.
 */
export async function renderMdx(source: string): Promise<RenderedMdx> {
  const toc: TocItem[] = [];
  if (!source?.trim()) {
    return { content: null, toc, error: null };
  }
  try {
    const { default: MDXContent } = await evaluate(source, {
      ...runtime,
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
    return {
      content: <MDXContent components={mdxComponents} />,
      toc,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: null, toc, error: message };
  }
}
