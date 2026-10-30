import "server-only";

import type {
  BlockContent,
  ListItem,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";

/**
 * MDX сайта → обычный Markdown для ИИ-агентов и `llms-full.txt`. Компоненты
 * (`<Callout>`, `<Spoiler>`, `<Cards>` и т. д.) превращаются в цитаты, списки
 * и текст, импорты и выражения выбрасываются, относительные ссылки и картинки
 * становятся абсолютными. Формулы остаются в `$…$`, таблицы — GFM.
 */

type Ctx = { base: string; source: string };

type Jsx = Extract<
  RootContent,
  { type: "mdxJsxFlowElement" | "mdxJsxTextElement" }
>;

const CALLOUT: Record<string, string> = {
  info: "Заметка",
  tip: "Совет",
  warning: "Внимание",
  danger: "Важно",
  success: "Готово",
};

const parser = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkGfm)
  .use(remarkMath);

const printer = unified()
  .use(remarkStringify, {
    bullet: "-",
    emphasis: "_",
    fences: true,
    listItemIndent: "one",
    rule: "-",
  })
  .use(remarkGfm)
  .use(remarkMath);

/** Converts MDX to Markdown; `baseUrl` resolves relative links and images. */
export function mdxToMarkdown(source: string, baseUrl: string): string {
  if (!source.trim()) return "";
  try {
    const tree = parser.parse(source);
    tree.children = convert(tree.children, {
      base: baseUrl,
      source,
    }) as RootContent[];
    return printer.stringify(tree as Root).trim();
  } catch {
    // Невалидный MDX на сайте всё равно не отрисуется; агенту отдаём исходник.
    return source.trim();
  }
}

function convert(nodes: Nodes[], ctx: Ctx): Nodes[] {
  const out: Nodes[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "mdxjsEsm":
      case "mdxFlowExpression":
      case "mdxTextExpression":
        continue;
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement":
        out.push(...jsx(node, ctx));
        continue;
      case "inlineMath": {
        // `$$…$$` посреди абзаца — тоже inlineMath, а stringify ставит один
        // доллар; сохраняем двойные как есть, чтобы формула осталась выключной.
        const at = node.position?.start.offset;
        if (at != null && ctx.source.startsWith("$$", at)) {
          out.push({ type: "html", value: `$$${node.value}$$` });
          continue;
        }
        break;
      }
      case "link":
      case "image":
      case "definition":
        node.url = resolve(node.url, ctx.base);
        break;
    }
    if ("children" in node) {
      node.children = convert(node.children, ctx) as typeof node.children;
    }
    out.push(node);
  }
  return out;
}

function jsx(node: Jsx, ctx: Ctx): Nodes[] {
  const inline = node.type === "mdxJsxTextElement";
  const children = convert(node.children, ctx);
  switch (node.name) {
    case "Callout": {
      if (inline) return children;
      const label = CALLOUT[attr(node, "type") ?? ""] ?? CALLOUT.info;
      const title = attr(node, "title");
      return [
        {
          type: "blockquote",
          children: [
            paragraph([strong(title ? `${label}: ${title}` : label)]),
            ...(children as BlockContent[]),
          ],
        },
      ];
    }
    case "Spoiler":
      if (inline) return children;
      return [
        paragraph([strong(attr(node, "title") || "Показать")]),
        ...children,
      ];
    case "Badge":
      return [{ type: "strong", children: children as PhrasingContent[] }];
    case "Level":
      return [
        text(`сложность ${attr(node, "value")}/${attr(node, "max") ?? 5}`),
      ];
    case "Tags":
      return [text(`метки: ${splitList(attr(node, "items")).join(", ")}`)];
    case "Meta":
      return children.map((c) =>
        c.type === "paragraph" ? paragraph(joinMeta(c.children)) : c,
      );
    case "Card": {
      const head = paragraph(cardHead(node, ctx));
      return inline ? head.children : [head, ...children];
    }
    case "Cards": {
      const items: ListItem[] = [];
      for (const c of node.children) {
        if (c.type !== "mdxJsxFlowElement" || c.name !== "Card") continue;
        items.push({
          type: "listItem",
          spread: false,
          children: [
            paragraph(cardHead(c, ctx)),
            ...(convert(c.children, ctx) as BlockContent[]),
          ],
        });
      }
      if (items.length === 0) return children;
      return [{ type: "list", ordered: false, spread: false, children: items }];
    }
    case "Matcher":
      return inline
        ? []
        : [
            paragraph([
              {
                type: "emphasis",
                children: [
                  text("Интерактивная анкета-подбор — откройте страницу."),
                ],
              },
            ]),
          ];
    default:
      // Steps и всё незнакомое: обёртка без своего смысла, оставляем содержимое.
      return children;
  }
}

function cardHead(node: Jsx, ctx: Ctx): PhrasingContent[] {
  const title = attr(node, "title") ?? "";
  const href = attr(node, "href");
  const n = attr(node, "n");
  const head: PhrasingContent[] = [];
  if (n) head.push(text(`${n}. `));
  head.push(
    href
      ? {
          type: "link",
          url: resolve(href, ctx.base),
          children: [strong(title)],
        }
      : strong(title),
  );
  const meta = [
    attr(node, "badge"),
    attr(node, "level") && `сложность ${attr(node, "level")}/5`,
    attr(node, "tags") && splitList(attr(node, "tags")).join(", "),
  ].filter(Boolean);
  if (meta.length > 0) head.push(text(` — ${meta.join(" · ")}`));
  return head;
}

/** Badge, Level и Tags в одну строку через точку вместо пробелов разметки. */
function joinMeta(children: PhrasingContent[]): PhrasingContent[] {
  const parts = children.filter((c) => !(c.type === "text" && !c.value.trim()));
  return parts.flatMap((p, i) => (i === 0 ? [p] : [text(" · "), p]));
}

function attr(node: Jsx, name: string): string | undefined {
  for (const a of node.attributes) {
    if (a.type !== "mdxJsxAttribute" || a.name !== name) continue;
    if (a.value == null) return "";
    if (typeof a.value === "string") return a.value;
    // level={2} или title={"…"}: берём исходник выражения без кавычек.
    return a.value.value.trim().replace(/^(['"`])([\s\S]*)\1$/, "$2");
  }
  return undefined;
}

function splitList(s: string | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function resolve(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

const text = (value: string): PhrasingContent => ({ type: "text", value });
const strong = (value: string): PhrasingContent => ({
  type: "strong",
  children: [text(value)],
});
const paragraph = (children: PhrasingContent[]): Paragraph => ({
  type: "paragraph",
  children,
});
