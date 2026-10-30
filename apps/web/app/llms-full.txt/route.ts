import { llmsFullTxt } from "@/lib/llms/documents";
import { markdownResponse } from "@/lib/llms/response";

/** Все опубликованные материалы одним Markdown-файлом. */
export const dynamic = "force-dynamic";

export async function GET() {
  return markdownResponse(await llmsFullTxt(), { type: "text/plain" });
}
