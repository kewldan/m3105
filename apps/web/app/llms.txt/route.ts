import { llmsTxt } from "@/lib/llms/documents";
import { markdownResponse } from "@/lib/llms/response";

/** Индекс сайта для ИИ-агентов по https://llmstxt.org. */
export const dynamic = "force-dynamic";

export async function GET() {
  return markdownResponse(await llmsTxt(), { type: "text/plain" });
}
