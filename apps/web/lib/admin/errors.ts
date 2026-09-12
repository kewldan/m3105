import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/client";

/**
 * Shows a toast for any error and, when a form is given, maps the server's
 * per-field validation messages onto react-hook-form errors.
 */
export function handleApiError<T extends FieldValues>(
  err: unknown,
  setError?: UseFormSetError<T>,
  fieldMap?: Partial<Record<string, Path<T>>>,
): void {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      toast.error("Сессия истекла. Войдите заново");
      if (typeof window !== "undefined") window.location.href = "/admin/login";
      return;
    }
    let mapped = 0;
    if (setError) {
      for (const [key, message] of Object.entries(err.fields)) {
        if (key === "_") continue;
        const path = (fieldMap?.[key] ?? key) as Path<T>;
        setError(path, { type: "server", message });
        mapped += 1;
      }
    }
    const general =
      err.fields._ ?? (mapped > 0 ? "Проверьте выделенные поля" : err.message);
    toast.error(general);
    return;
  }
  toast.error(err instanceof Error ? err.message : "Что-то пошло не так");
}
