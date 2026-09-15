import katex from "katex";
import type { ReactNode } from "react";

/**
 * Very small inline Markdown renderer for short option texts:
 * `code`, **bold**, *italic* and $formulas$. Anything else is printed as-is.
 */
export function InlineMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`|\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded-md border bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("$")) {
      nodes.push(
        <span
          key={key++}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output is generated from trusted admin content.
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(tok.slice(1, -1), {
              throwOnError: false,
              output: "htmlAndMathml",
            }),
          }}
        />,
      );
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
