"use client";

import { apiClient } from "./client";
import type {
  Comment,
  CommentTarget,
  GradesResponse,
  MeResponse,
  PasskeyBeginResponse,
  PracticeListResponse,
  PracticeSessionView,
  StudentChoice,
  TelegramAuthData,
} from "./types";

// Browser-side client for student accounts (Telegram + passkeys, no passwords).

export const userApi = {
  me: () => apiClient<MeResponse>("/auth/user/me"),
  logout: () =>
    apiClient<{ ok: true }>("/auth/user/logout", { method: "POST" }),

  telegramLogin: (data: TelegramAuthData) =>
    apiClient<MeResponse>("/auth/telegram", { method: "POST", body: data }),
  /** Development only: sign in by name without Telegram. */
  devLogin: (name: string) =>
    apiClient<MeResponse>("/auth/dev-login", {
      method: "POST",
      body: { name },
    }),

  /** Requires a student session: passkeys are added to existing accounts only. */
  passkeyRegisterBegin: () =>
    apiClient<PasskeyBeginResponse<unknown>>("/auth/passkey/register/begin", {
      method: "POST",
      body: {},
    }),
  passkeyRegisterFinish: (body: {
    challengeId: string;
    label?: string;
    credential: unknown;
  }) =>
    apiClient<MeResponse>("/auth/passkey/register/finish", {
      method: "POST",
      body,
    }),
  passkeyLoginBegin: () =>
    apiClient<PasskeyBeginResponse<unknown>>("/auth/passkey/login/begin", {
      method: "POST",
    }),
  passkeyLoginFinish: (body: { challengeId: string; credential: unknown }) =>
    apiClient<MeResponse>("/auth/passkey/login/finish", {
      method: "POST",
      body,
    }),
  /** Кого из списка курса ещё никто не выбрал; подтверждённому — пустой список. */
  students: () => apiClient<StudentChoice[]>("/me/students"),
  /** Выбор себя в списке: подтверждает аккаунт, имя и группу потом не сменить. */
  claim: (studentId: number) =>
    apiClient<MeResponse>("/me/claim", { method: "POST", body: { studentId } }),
  grades: (source?: number) =>
    apiClient<GradesResponse>(`/grades${source ? `?source=${source}` : ""}`),
  deletePasskey: (id: string) =>
    apiClient<MeResponse>(`/me/passkeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  setLabDone: (labId: number, done: boolean) =>
    apiClient<{ completedLabIds: number[] }>(`/me/labs/${labId}/done`, {
      method: done ? "PUT" : "DELETE",
    }),

  practiceList: (
    params: { subject?: string; past?: boolean; for?: string } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.subject) qs.set("subject", params.subject);
    if (params.past) qs.set("past", "1");
    if (params.for) qs.set("for", params.for);
    const q = qs.toString();
    return apiClient<PracticeListResponse>(`/practice${q ? `?${q}` : ""}`);
  },
  practiceGet: (id: number) =>
    apiClient<PracticeSessionView>(`/practice/${id}`),
  /** Replaces the caller's lab list for the session; an empty list cancels. */
  /** Защиты лаб и теормин по лабам (без theoryLabIds теормин не трогается). */
  practiceSignup: (id: number, labIds: number[], theoryLabIds?: number[]) =>
    apiClient<PracticeSessionView>(`/practice/${id}/signups`, {
      method: "PUT",
      body: { labIds, theoryLabIds },
    }),
  practiceCancel: (id: number) =>
    apiClient<PracticeSessionView>(`/practice/${id}/signups`, {
      method: "DELETE",
    }),
  /** Moves the caller's defenses to the end of a frozen queue. */
  practiceSkip: (id: number) =>
    apiClient<PracticeSessionView>(`/practice/${id}/skip`, { method: "POST" }),
  /** Moves the caller's defenses not reached last time to the front, with a mark. */
  practiceNotReached: (id: number) =>
    apiClient<PracticeSessionView>(`/practice/${id}/not-reached`, {
      method: "POST",
    }),
  /** Offers my defense (labId) for another student's one. */
  practiceRequestSwap: (
    id: number,
    body: { labId: number; withUserId: number; withLabId: number },
  ) =>
    apiClient<PracticeSessionView>(`/practice/${id}/swaps`, {
      method: "POST",
      body,
    }),
  practiceAcceptSwap: (swapId: number) =>
    apiClient<PracticeSessionView>(`/practice/swaps/${swapId}/accept`, {
      method: "POST",
    }),
  /** Withdraws my request or declines one sent to me. */
  practiceDeleteSwap: (swapId: number) =>
    apiClient<PracticeSessionView>(`/practice/swaps/${swapId}`, {
      method: "DELETE",
    }),

  // ---- comments ----
  comments: (target: CommentTarget, id: number) =>
    apiClient<Comment[]>(`/comments/${target}/${id}`),
  addComment: (
    target: CommentTarget,
    id: number,
    body: string,
    attachmentIds: string[] = [],
  ) =>
    apiClient<Comment>(`/comments/${target}/${id}`, {
      method: "POST",
      body: { body, attachmentIds },
    }),
  deleteComment: (id: number) =>
    apiClient<{ ok: true }>(`/comments/${id}`, { method: "DELETE" }),
};
