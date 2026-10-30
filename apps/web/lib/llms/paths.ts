/** Markdown address of a page: "/" → "/index.md", "/labs" → "/labs.md". */
export function markdownPath(path: string): string {
  return path === "/" ? "/index.md" : `${path}.md`;
}

// Те же страницы, что в MARKDOWN_PAGES из next.config.ts, плюс главная.
const WITH_MARKDOWN =
  /^\/(?:|faq|(?:labs|notes)(?:\/[^/?#]+\/[^/?#]+)?|subjects(?:\/[^/?#]+)?|p\/[^/?#]+)$/;

/** Whether the site serves a Markdown copy of this path (no query or hash). */
export function hasMarkdown(path: string): boolean {
  return WITH_MARKDOWN.test(path);
}
