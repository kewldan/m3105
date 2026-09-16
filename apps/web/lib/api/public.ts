import "server-only";

import { ApiError, apiServer } from "./client";
import { TAG } from "./tags";
import type {
  CalendarResponse,
  Comment,
  CommentTarget,
  FAQItem,
  HomeResponse,
  Lab,
  MeResponse,
  Note,
  NoteResponse,
  Page,
  Post,
  PostKind,
  PostSort,
  PracticeListResponse,
  PracticeSessionView,
  Quiz,
  QuizSummary,
  SearchResult,
  SettingsResponse,
  SubjectResponse,
  SubjectWithCounts,
} from "./types";

// Typed accessors for the public (unauthenticated) API. Server components only.
// Ответы кешируются в Data Cache с тегами: админка при сохранении дёргает
// /api/revalidate, и кеш сбрасывается сразу.

export const getSettings = () =>
  apiServer<SettingsResponse>("/settings", { tags: [TAG.settings] });
export const getHome = () =>
  apiServer<HomeResponse>("/home", { tags: [TAG.home] });
export const getSubjects = () =>
  apiServer<SubjectWithCounts[]>("/subjects", { tags: [TAG.subjects] });
export const getSubject = (slug: string) =>
  apiServer<SubjectResponse>(`/subjects/${encodeURIComponent(slug)}`, {
    tags: [TAG.subjects, TAG.labs, TAG.notes, TAG.quizzes],
  });
export const getLabs = (subject?: string) =>
  apiServer<Lab[]>(
    `/labs${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`,
    { tags: [TAG.labs] },
  );
export const getLab = (subject: string, slug: string) =>
  apiServer<Lab>(
    `/labs/${encodeURIComponent(subject)}/${encodeURIComponent(slug)}`,
    { tags: [TAG.labs] },
  );
export const getCalendar = (
  params: { from?: string; to?: string; subject?: string } = {},
) => {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.subject) qs.set("subject", params.subject);
  const q = qs.toString();
  return apiServer<CalendarResponse>(`/calendar${q ? `?${q}` : ""}`, {
    tags: [TAG.calendar],
  });
};
export const getFAQ = () => apiServer<FAQItem[]>("/faq", { tags: [TAG.faq] });
export const getPages = () =>
  apiServer<Page[]>("/pages", { tags: [TAG.pages] });
export const getPage = (slug: string) =>
  apiServer<Page>(`/pages/${encodeURIComponent(slug)}`, { tags: [TAG.pages] });
export const getNotes = (subject?: string) =>
  apiServer<Note[]>(
    `/notes${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`,
    { tags: [TAG.notes] },
  );
export const getNote = (subject: string, slug: string) =>
  apiServer<NoteResponse>(
    `/notes/${encodeURIComponent(subject)}/${encodeURIComponent(slug)}`,
    { tags: [TAG.notes, TAG.quizzes] },
  );
export const getQuizzes = (subject?: string) =>
  apiServer<QuizSummary[]>(
    `/quizzes${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`,
    { tags: [TAG.quizzes] },
  );
export const getQuiz = (slug: string) =>
  apiServer<Quiz>(`/quizzes/${encodeURIComponent(slug)}`, {
    tags: [TAG.quizzes],
  });
export const search = (q: string) =>
  apiServer<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`);

/** Signed-in student for the given Cookie header, or null. */
export async function getMe(
  cookie: string | undefined,
): Promise<MeResponse | null> {
  if (!cookie) return null;
  try {
    return await apiServer<MeResponse>("/auth/user/me", {
      headers: { cookie },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/** Practice (lab defence) sessions; pass the Cookie header to get participants. */
export const getPractice = (
  cookie?: string,
  params: { subject?: string; past?: boolean } = {},
) => {
  const qs = new URLSearchParams();
  if (params.subject) qs.set("subject", params.subject);
  if (params.past) qs.set("past", "1");
  const q = qs.toString();
  return apiServer<PracticeListResponse>(
    `/practice${q ? `?${q}` : ""}`,
    cookie ? { headers: { cookie } } : {},
  );
};
export const getPracticeSession = (id: number, cookie?: string) =>
  apiServer<PracticeSessionView>(
    `/practice/${id}`,
    cookie ? { headers: { cookie } } : {},
  );

/** Comments of a note, lab or post; pass the Cookie header to mark the viewer's own. */
export const getComments = (
  target: CommentTarget,
  id: number,
  cookie?: string,
) =>
  apiServer<Comment[]>(
    `/comments/${target}/${id}`,
    cookie ? { headers: { cookie } } : {},
  );

/** One feed of user posts; the cookie fills `liked` and `mine`. */
export const getPosts = (kind: PostKind, sort: PostSort, cookie?: string) =>
  apiServer<Post[]>(
    `/posts?kind=${kind}&sort=${sort}`,
    cookie ? { headers: { cookie } } : {},
  );
