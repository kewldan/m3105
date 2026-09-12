"use client";

import { apiClient } from "./client";
import type {
  MeResponse,
  PasskeyBeginResponse,
  PracticeListResponse,
  PracticeSessionView,
  TelegramAuthData,
} from "./types";

// Browser-side client for student accounts (Telegram + passkeys, no passwords).

export const userApi = {
  me: () => apiClient<MeResponse>("/auth/user/me"),
  logout: () =>
    apiClient<{ ok: true }>("/auth/user/logout", { method: "POST" }),
  updateName: (name: string) =>
    apiClient<MeResponse>("/me/", { method: "PUT", body: { name } }),

  telegramLogin: (data: TelegramAuthData, inviteCode?: string) =>
    apiClient<MeResponse>("/auth/telegram", {
      method: "POST",
      body: { ...data, inviteCode },
    }),
  /** Development only: sign in by name without Telegram. */
  devLogin: (name: string, inviteCode?: string) =>
    apiClient<MeResponse>("/auth/dev-login", {
      method: "POST",
      body: { name, inviteCode },
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
  deletePasskey: (id: string) =>
    apiClient<MeResponse>(`/me/passkeys/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  setLabDone: (labId: number, done: boolean) =>
    apiClient<{ completedLabIds: number[] }>(`/me/labs/${labId}/done`, {
      method: done ? "PUT" : "DELETE",
    }),

  practiceList: (params: { subject?: string; past?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.subject) qs.set("subject", params.subject);
    if (params.past) qs.set("past", "1");
    const q = qs.toString();
    return apiClient<PracticeListResponse>(`/practice${q ? `?${q}` : ""}`);
  },
  practiceGet: (id: number) =>
    apiClient<PracticeSessionView>(`/practice/${id}`),
  /** Replaces the caller's lab list for the session; an empty list cancels. */
  practiceSignup: (id: number, labIds: number[]) =>
    apiClient<PracticeSessionView>(`/practice/${id}/signups`, {
      method: "PUT",
      body: { labIds },
    }),
  practiceCancel: (id: number) =>
    apiClient<PracticeSessionView>(`/practice/${id}/signups`, {
      method: "DELETE",
    }),
};
