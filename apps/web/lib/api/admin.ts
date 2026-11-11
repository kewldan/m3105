"use client";

import { apiClient } from "./client";
import type {
  AdminAttachment,
  AdminComment,
  AdminUser,
  AdminUserInput,
  Comment,
  Edit,
  EditorCandidate,
  EditorRole,
  Event,
  EventInput,
  GradeSource,
  GradeSourceInput,
  GradeSyncResult,
  Lab,
  LabInput,
  Note,
  NoteInput,
  OverviewResponse,
  Page,
  PageInput,
  Participant,
  PracticeRule,
  PracticeRuleInput,
  PracticeRulePlanItem,
  PracticeSession,
  PracticeSessionInput,
  QueueEntry,
  Quiz,
  QuizInput,
  QuizQuestion,
  QuizSummary,
  SearchStat,
  Settings,
  Student,
  StudentImportResult,
  StudentInput,
  StudyGroup,
  Subject,
  SubjectInput,
  SubjectWithCounts,
  User,
} from "./types";

// Browser-side client for the password-protected admin API.

/** Очередь сдачи; `queueManual` — порядок задан админом вручную. */
export type PracticeQueue = {
  session: PracticeSession;
  queue: QueueEntry[];
  /** Кто придёт на теормин и по каким лабам. */
  theory: Participant[];
  queueManual: boolean;
  freezesAt: string;
  frozen: boolean;
};

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
    /** Отвязывает аккаунт от выбранного студента: он выберет себя заново. */
    unclaim: (id: number) =>
      apiClient<User>(`/admin/users/${id}/student`, { method: "DELETE" }),
  },
  /** Ответственные за потоки и группы. */
  editors: {
    list: () => apiClient<EditorRole[]>("/admin/editors"),
    candidates: () => apiClient<EditorCandidate[]>("/admin/editors/candidates"),
    grant: (input: { userId: number; scope: string }) =>
      apiClient<EditorRole>("/admin/editors", { method: "POST", body: input }),
    revoke: (id: number) =>
      apiClient<{ ok: true }>(`/admin/editors/${id}`, { method: "DELETE" }),
  },
  /** Журнал правок контента. */
  journal: {
    list: (entity?: string) =>
      apiClient<Edit[]>(
        `/admin/journal${entity ? `?entity=${encodeURIComponent(entity)}` : ""}`,
      ),
    revert: (id: number) =>
      apiClient<{ ok: true; entityId: number }>(`/admin/journal/${id}/revert`, {
        method: "POST",
      }),
  },
  /** Группы из списка курса с потоками — для выбора аудитории. */
  studyGroups: () => apiClient<StudyGroup[]>("/admin/study-groups"),
  students: {
    list: () => apiClient<Student[]>("/admin/students"),
    /** Таблица, скопированная со страницы, CSV или сохранённая страница (.html, .mht). */
    import: (text: string) =>
      apiClient<StudentImportResult>("/admin/students/import", {
        method: "POST",
        body: { text },
      }),
    create: (input: StudentInput) =>
      apiClient<Student[]>("/admin/students", { method: "POST", body: input }),
    remove: (id: number) =>
      apiClient<{ ok: true }>(`/admin/students/${id}`, { method: "DELETE" }),
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
      apiClient<PracticeQueue>(`/admin/practice/${id}/signups`),
    /** Новый порядок очереди: все защиты сдачи. Очередь становится ручной. */
    reorder: (id: number, entries: { userId: number; labId: number }[]) =>
      apiClient<PracticeQueue>(`/admin/practice/${id}/signups/order`, {
        method: "PUT",
        body: { entries },
      }),
    /** Забыть ручной порядок и пересчитать очередь автоматически. */
    autoQueue: (id: number) =>
      apiClient<PracticeQueue>(`/admin/practice/${id}/signups/auto`, {
        method: "POST",
      }),
    /** Отменить занятие; `moveSignups` — перенести записи на следующее. */
    cancel: (id: number, input: { reason: string; moveSignups: boolean }) =>
      apiClient<PracticeSession>(`/admin/practice/${id}/cancel`, {
        method: "POST",
        body: input,
      }),
    restore: (id: number) =>
      apiClient<PracticeSession>(`/admin/practice/${id}/restore`, {
        method: "POST",
      }),
    /** Вернуть изменённое вручную занятие к его правилу. */
    reset: (id: number) =>
      apiClient<PracticeSession>(`/admin/practice/${id}/reset`, {
        method: "POST",
      }),
  },
  practiceRules: {
    ...resource<PracticeRule, PracticeRuleInput>("/admin/practice-rules"),
    /** Что сохранение правила сделает с каждой датой; `id` — для правки. */
    preview: (rule: PracticeRuleInput, id: number | null) =>
      apiClient<PracticeRulePlanItem[]>("/admin/practice-rules/preview", {
        method: "POST",
        body: { id, rule },
      }),
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
  gradeSources: {
    ...resource<GradeSource, GradeSourceInput>("/admin/grade-sources"),
    sync: (id: number) =>
      apiClient<GradeSyncResult>(`/admin/grade-sources/${id}/sync`, {
        method: "POST",
      }),
  },
  events: resource<Event, EventInput>("/admin/events"),
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
