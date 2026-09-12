import { evaluate } from "@mdx-js/mdx";
import type { Root } from "hast";
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
