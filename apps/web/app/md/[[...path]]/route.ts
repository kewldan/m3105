import {
  faqMarkdown,
  homeMarkdown,
  labMarkdown,
  labsMarkdown,
  noteMarkdown,
  notesMarkdown,
  pageMarkdown,
  subjectMarkdown,
  subjectsMarkdown,
} from "@/lib/llms/documents";
import { markdownResponse } from "@/lib/llms/response";

/**
 * Markdown-версии страниц сайта. Снаружи сюда приходят через rewrites из
 * next.config.ts: `/labs/prog/lab-1.md` или `/labs/prog/lab-1` с
 * `Accept: text/markdown` → `/md/labs/prog/lab-1`.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ path?: string[] }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { path = [] } = await params;
  const canonical = `/${path.join("/")}`;
  return markdownResponse(await render(path), { canonical });
}

function render(path: string[]): Promise<string | null> {
  const [section, a, b] = path;
  switch (`${section ?? ""}/${path.length}`) {
    case "/0":
      return homeMarkdown();
    case "labs/1":
      return labsMarkdown();
    case "labs/3":
      return labMarkdown(a, b);
    case "notes/1":
      return notesMarkdown();
    case "notes/3":
      return noteMarkdown(a, b);
    case "subjects/1":
      return subjectsMarkdown();
    case "subjects/2":
      return subjectMarkdown(a);
    case "p/2":
      return pageMarkdown(a);
    case "faq/1":
      return faqMarkdown();
    default:
      return Promise.resolve(null);
  }
}
