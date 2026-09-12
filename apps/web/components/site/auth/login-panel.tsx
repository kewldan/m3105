"use client";

import { FingerprintIcon, SendIcon, WrenchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { AuthInfo, MeResponse, TelegramAuthData } from "@/lib/api/types";
import { userApi } from "@/lib/api/user";
import {
  browserSupportsWebAuthn,
  loginWithPasskey,
  PasskeyCancelled,
} from "@/lib/auth/passkeys";
import {
  loadTelegram,
  TelegramCancelled,
  telegramAuth,
} from "@/lib/auth/telegram";

type Pending = { kind: "telegram"; data: TelegramAuthData } | { kind: "dev" };

function errorMessage(err: unknown): string {
  if (err instanceof PasskeyCancelled || err instanceof TelegramCancelled)
    return "";
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.name === "NotSupportedError")
    return "Браузер не поддерживает пасскеи";
  return "Что-то пошло не так, попробуйте ещё раз";
}

/** Three sign-in buttons: Telegram, passkey and (outside production) dev login. */
export function LoginPanel({
  auth,
  next,
  devName,
}: {
  auth: AuthInfo;
  next: string;
  devName: string;
}) {
  const router = useRouter();
  const { setMe } = useUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webauthn, setWebauthn] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const hasTelegram = auth.telegramBotId.length > 0;

  useEffect(() => {
    setWebauthn(browserSupportsWebAuthn());
    if (hasTelegram) void loadTelegram().catch(() => {});
  }, [hasTelegram]);

  const finish = (me: MeResponse) => {
    setMe(me);
    toast.success(`Привет, ${me.user.name}!`);
    router.push(next);
    router.refresh();
  };

  const run = async (
    key: string,
    action: Pending | null,
    fn: () => Promise<MeResponse>,
  ) => {
    setBusy(key);
    setError(null);
    try {
      finish(await fn());
    } catch (err) {
      if (err instanceof ApiError && err.code === "invite_required") {
        setPending(action);
        setError(
          inviteCode
            ? "Код доступа не подошёл"
            : "Для первого входа нужен код доступа группы",
        );
      } else {
        setError(errorMessage(err) || null);
      }
    } finally {
      setBusy(null);
    }
  };

  const viaTelegram = (data: TelegramAuthData) =>
    run("telegram", { kind: "telegram", data }, () =>
      userApi.telegramLogin(data, inviteCode || undefined),
    );
  const onTelegram = async () => {
    setBusy("telegram");
    setError(null);
    try {
      const data = await telegramAuth(auth.telegramBotId);
      await viaTelegram(data);
    } catch (err) {
      setError(errorMessage(err) || null);
      setBusy(null);
    }
  };
  const onPasskey = () => run("passkey", null, () => loginWithPasskey());
  const onDev = () =>
    run("dev", { kind: "dev" }, () =>
      userApi.devLogin(devName, inviteCode || undefined),
    );
  const retry = () => {
    if (!pending) return;
    if (pending.kind === "telegram") return viaTelegram(pending.data);
    return onDev();
  };

  const icon = (key: string, Icon: typeof SendIcon) =>
    busy === key ? (
      <Spinner data-icon="inline-start" />
    ) : (
      <Icon data-icon="inline-start" />
    );

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        disabled={busy !== null || !hasTelegram}
        onClick={onTelegram}
        title={hasTelegram ? undefined : "Вход через Telegram ещё не настроен"}
      >
        {icon("telegram", SendIcon)}
        Войти через Telegram
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="w-full"
        disabled={busy !== null || !webauthn}
        onClick={onPasskey}
        title={webauthn ? undefined : "Браузер не поддерживает пасскеи"}
      >
        {icon("passkey", FingerprintIcon)}
        Войти с пасскеем
      </Button>
      {auth.devLogin ? (
        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          disabled={busy !== null}
          onClick={onDev}
        >
          {icon("dev", WrenchIcon)}
          Войти через дев
        </Button>
      ) : null}

      {pending ? (
        <form
          className="flex gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void retry();
          }}
        >
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Код доступа группы"
            autoComplete="one-time-code"
            aria-label="Код доступа группы"
            autoFocus
          />
          <Button type="submit" disabled={busy !== null || !inviteCode.trim()}>
            Войти
          </Button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
