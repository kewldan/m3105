"use client";

import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Введите пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.login(password);
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === "bad_password"
            ? "Неверный пароль"
            : err.code === "rate_limited"
              ? "Слишком много попыток. Подождите 15 минут"
              : err.message,
        );
      } else {
        setError("Не удалось связаться с сервером");
      }
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-4">
      <form
        onSubmit={onSubmit}
        className="animate-rise w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockIcon className="size-5" aria-hidden />
          </div>
          <h1 className="font-heading text-xl font-semibold">Вход в админку</h1>
          <p className="text-sm text-muted-foreground">
            Панель управления сайтом группы М3105
          </p>
        </div>

        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="password">Пароль</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              placeholder="••••••••"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="button"
                size="icon-xs"
                aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                onClick={() => setShow((s) => !s)}
              >
                {show ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldError>{error}</FieldError>
        </Field>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? <Spinner /> : null}
          Войти
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Вернуться на сайт
          </Link>
        </p>
      </form>
    </div>
  );
}
