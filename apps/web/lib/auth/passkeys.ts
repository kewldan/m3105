"use client";

import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type { MeResponse } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";

export { browserSupportsWebAuthn, platformAuthenticatorIsAvailable };

/** Thrown when the user dismissed the browser prompt. */
export class PasskeyCancelled extends Error {
  constructor() {
    super("Действие отменено");
    this.name = "PasskeyCancelled";
  }
}

function isCancel(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "NotAllowedError" || err.name === "AbortError")
  );
}

/** Adds a passkey to the signed-in account (accounts are created via Telegram). */
export async function registerPasskey(
  opts: { label?: string } = {},
): Promise<MeResponse> {
  const begin = await userApi.passkeyRegisterBegin();
  let credential: unknown;
  try {
    credential = await startRegistration({
      optionsJSON: begin.options as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (err) {
    if (isCancel(err)) throw new PasskeyCancelled();
    throw err;
  }
  return userApi.passkeyRegisterFinish({
    challengeId: begin.challengeId,
    label: opts.label,
    credential,
  });
}

/** Signs in with a discoverable passkey (no username needed). */
export async function loginWithPasskey(): Promise<MeResponse> {
  const begin = await userApi.passkeyLoginBegin();
  let credential: unknown;
  try {
    credential = await startAuthentication({
      optionsJSON: begin.options as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch (err) {
    if (isCancel(err)) throw new PasskeyCancelled();
    throw err;
  }
  return userApi.passkeyLoginFinish({
    challengeId: begin.challengeId,
    credential,
  });
}
