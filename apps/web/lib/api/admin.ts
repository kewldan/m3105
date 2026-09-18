"use client";

import { apiClient } from "./client";
import type {
  AdminAttachment,
  AdminComment,
  AdminUser,
  AdminUserInput,
  Comment,
  Event,
  EventInput,
  FAQInput,
  FAQItem,
  Lab,
  LabInput,
  Note,
  NoteInput,
  OverviewResponse,
  Page,
  PageInput,
  Participant,
  Post,
  PostInput,
  PostKind,
  PracticeSession,
  PracticeSessionInput,
  Quiz,
  QuizInput,
  QuizQuestion,
  QuizSummary,
  SearchStat,
  Settings,
  Subject,
  SubjectInput,
  SubjectWithCounts,
  User,
} from "./types";

// Browser-side client for the password-protected admin API.

export const authApi = {
  login: (password: string) =>
    apiClient<{ ok: true }>("/auth/login", {
      method: "POST",
      body: { password },
    }),
  logout: () => apiClient<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => apiClient<{ authenticated: boolean }>("/auth/me"),
};

function resource<T, In, L = T>(base: string) {
  return {
    list: (query?: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query ?? {})) {
        if (v !== undefined && v !== "") qs.set(k, String(v));
      }
      const q = qs.toString();
      return apiClient<L[]>(`${base}${q ? `?${q}` : ""}`);
    },
    get: (id: number) => apiClient<T>(`${base}/${id}`),
    create: (input: In) => apiClient<T>(base, { method: "POST", body: input }),
    update: (id: number, input: In) =>
      apiClient<T>(`${base}/${id}`, { method: "PUT", body: input }),
    remove: (id: number) =>
      apiClient<{ ok: true }>(`${base}/${id}`, { method: "DELETE" }),
  };
}

export const adminApi = {
  overview: () => apiClient<OverviewResponse>("/admin/overview"),
  users: {
    list: () => apiClient<AdminUser[]>("/admin/users"),
    update: (id: number, input: AdminUserInput) =>
      apiClient<User>(`/admin/users/${id}`, { method: "PUT", body: input }),
    remove: (id: number) =>
      apiClient<{ ok: true }>(`/admin/users/${id}`, { method: "DELETE" }),
  },
  /** Что студенты искали и что не нашли за последние `days` дней. */
  searchQueries: (days = 30) =>
    apiClient<SearchStat[]>(`/admin/search-queries?days=${days}`),
  comments: {
    list: () => apiClient<AdminComment[]>("/admin/comments"),
    /** Текст и файлы; без `attachmentIds` файлы не меняются. */
    update: (id: number, input: { body: string; attachmentIds?: string[] }) =>
      apiClient<Comment>(`/admin/comments/${id}`, {
        method: "PUT",
        body: input,
      }),
    remove: (id: number) =>
      apiClient<{ ok: true }>(`/admin/comments/${id}`, { method: "DELETE" }),
  },
  posts: {
    list: (kind?: PostKind) =>
      apiClient<Post[]>(`/admin/posts${kind ? `?kind=${kind}` : ""}`),
    update: (id: number, input: PostInput) =>
      apiClient<Post>(`/admin/posts/${id}`, { method: "PUT", body: input }),
    remove: (id: number) =>
      apiClient<{ ok: true }>(`/admin/posts/${id}`, { method: "DELETE" }),
  },
  /** Загрузка — `uploadFile(file, { target: "admin" })` из `lib/api/upload`. */
  files: {
    list: () => apiClient<AdminAttachment[]>("/admin/files"),
    remove: (id: string) =>
      apiClient<{ ok: true }>(`/admin/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  practice: {
    ...resource<PracticeSession, PracticeSessionInput>("/admin/practice"),
    signups: (id: number) =>
      apiClient<{ session: PracticeSession; participants: Participant[] }>(
        `/admin/practice/${id}/signups`,
      ),
  },
  settings: {
    get: () => apiClient<Settings>("/admin/settings"),
    update: (input: Settings) =>
      apiClient<Settings>("/admin/settings", { method: "PUT", body: input }),
  },
  subjects: resource<Subject, SubjectInput, SubjectWithCounts>(
    "/admin/subjects",
  ),
  labs: resource<Lab, LabInput>("/admin/labs"),
  events: resource<Event, EventInput>("/admin/events"),
  faq: resource<FAQItem, FAQInput>("/admin/faq"),
  pages: resource<Page, PageInput>("/admin/pages"),
  notes: resource<Note, NoteInput>("/admin/notes"),
  quizzes: {
    ...resource<Quiz, QuizInput, QuizSummary>("/admin/quizzes"),
    validate: (questions: QuizQuestion[]) =>
      apiClient<{ ok: true; questions: QuizQuestion[] }>(
        "/admin/quizzes/validate",
        {
          method: "POST",
          body: { questions },
        },
      ),
  },
};
