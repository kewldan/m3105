import "server-only";

import { absoluteUrl } from "@/lib/seo";

/**
 * Text response for agents. `Link: rel=canonical` points search engines at the
 * HTML page, so the Markdown copy doesn't compete with it in the index.
 */
export function markdownResponse(
  body: string | null,
  opts: { canonical?: string; type?: string } = {},
): Response {
  if (body == null) {
    return new Response("# Не найдено\n", {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
  const headers = new Headers({
    "Content-Type": `${opts.type ?? "text/markdown"}; charset=utf-8`,
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    Vary: "Accept",
  });
  if (opts.canonical) {
    headers.set("Link", `<${absoluteUrl(opts.canonical)}>; rel="canonical"`);
  }
  return new Response(body, { headers });
}
