import type { ApiErrorBody } from "./types";

/** Error thrown for non-2xx API responses. `fields` carries validation messages. */
export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error ?? `Ошибка запроса (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? "unknown";
    this.fields = body?.fields ?? {};
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

const PREFIX = "/api/v1";

function serverBase(): string {
  return (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body as ApiErrorBody | null);
  }
  return body as T;
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Extra headers, e.g. a forwarded Cookie on the server. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Cache tags for the Next Data Cache. Ответ кладётся в общий кеш и
   * сбрасывается из `/api/revalidate`, когда админка меняет контент.
   * Запрос с кукой не кэшируется никогда — в нём личные данные.
   */
  tags?: string[];
  /** Fallback TTL in seconds for tagged requests (default 300). */
  revalidate?: number;
};

/** Сколько живёт закешированный публичный ответ, если инвалидация не дошла. */
const DEFAULT_TTL = 300;

/**
 * Во время production-сборки API недоступен (образ собирается в CI без базы).
 * Кешируемый запрос сделал бы страницу кандидатом на пререндер, и сборка упала бы
 * на ECONNREFUSED, поэтому на этой фазе все запросы некешируемые: страницы
 * остаются динамическими, а кеш данных работает уже в рантайме.
 */
const BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

/**
 * Server-side request (React Server Components, route handlers). Talks to the
 * Go API directly over the internal network. По умолчанию без кеша; публичные
 * ответы кешируются, только если переданы `tags` и в запросе нет куки.
 */
export async function apiServer<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const personal = opts.headers?.cookie !== undefined;
  const cacheable =
    !BUILD_PHASE &&
    !personal &&
    (opts.method ?? "GET") === "GET" &&
    !!opts.tags?.length;
  const res = await fetch(`${serverBase()}${PREFIX}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    ...(cacheable
      ? {
          next: { tags: opts.tags, revalidate: opts.revalidate ?? DEFAULT_TTL },
        }
      : { cache: "no-store" as const }),
    signal: opts.signal,
  });
  return parse<T>(res);
}

/**
 * Browser-side request. Uses the same-origin `/api` prefix (proxied by Next in
 * development and by Traefik in production) so the HttpOnly session cookie is
 * sent automatically.
 */
export async function apiClient<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await fetch(`${PREFIX}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(opts.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
  });
  return parse<T>(res);
}
