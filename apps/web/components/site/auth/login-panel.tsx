"use client";

import { FingerprintIcon, SendIcon, WrenchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useUser } from "@/components/site/user-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import type { AuthInfo, MeResponse } from "@/lib/api/types";
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
  const hasTelegram = auth.telegramBotId.length > 0;

  useEffect(() => {
    setWebauthn(browserSupportsWebAuthn());
    if (hasTelegram) void loadTelegram().catch(() => {});
  }, [hasTelegram]);

  const finish = (me: MeResponse) => {
    setMe(me);
    if (me.user.approved) {
      toast.success(`Привет, ${me.user.name}!`);
      router.push(next);
    } else {
      toast.info("Осталось найти себя в списке студентов");
      router.push("/me");
    }
    router.refresh();
  };

  const run = async (key: string, fn: () => Promise<MeResponse>) => {
    setBusy(key);
    setError(null);
    try {
      finish(await fn());
    } catch (err) {
      setError(errorMessage(err) || null);
    } finally {
      setBusy(null);
    }
  };

  const onTelegram = () =>
    run("telegram", async () =>
      userApi.telegramLogin(await telegramAuth(auth.telegramBotId)),
    );
  const onPasskey = () => run("passkey", () => loginWithPasskey());
  const onDev = () => run("dev", () => userApi.devLogin(devName));

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

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
