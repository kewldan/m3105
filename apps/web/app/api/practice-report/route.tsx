import { type NextRequest, NextResponse } from "next/server";

import { isNotFound } from "@/lib/api/client";
import { getPracticeSession, getSettings } from "@/lib/api/public";
import { renderPracticeReport } from "@/lib/report/practice-report";

/**
 * PNG-отчёт «Кто сдаёт» по одной сдаче для Telegram-бота. Дёргает Go-API
 * (`GET http://web:3000/api/practice-report?id=…` во внутренней сети, снаружи
 * `/api/*` уходит в Go через nginx и сюда не попадает) с заголовком
 * `Authorization: Bearer <REVALIDATE_TOKEN>`: рендер дорогой, открывать его
 * всем незачем. Данные — публичные `GET /practice/{id}` и `/settings`, без кеша.
 *
 * Путь статический намеренно: динамический `/api/…/[id]` перехватил бы rewrite
 * `/api/:path*` → Go (afterFiles проверяется раньше динамических роутов).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.REVALIDATE_TOKEN;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "REVALIDATE_TOKEN не настроен" },
      { status: 503 },
    );
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Неверный id" }, { status: 400 });
  }

  let session: Awaited<ReturnType<typeof getPracticeSession>>;
  try {
    session = await getPracticeSession(id);
  } catch (err) {
    if (isNotFound(err)) {
      return NextResponse.json({ error: "Сдача не найдена" }, { status: 404 });
    }
    throw err;
  }
  const { settings } = await getSettings();

  const png = await renderPracticeReport({
    session,
    settings,
    avatars: await fetchAvatars(session),
    now: new Date(),
  });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

/** Аватарки участников с API (превью 160 px); не скачалась — останутся инициалы. */
async function fetchAvatars(
  session: Awaited<ReturnType<typeof getPracticeSession>>,
): Promise<Map<string, Uint8Array>> {
  const base = (process.env.API_URL ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );
  const urls = new Set<string>();
  for (const e of session.queue) if (e.user.photoUrl) urls.add(e.user.photoUrl);
  const out = new Map<string, Uint8Array>();
  await Promise.all(
    [...urls].map(async (url) => {
      if (!url.startsWith("/")) return;
      try {
        const res = await fetch(`${base}${url}?w=160`, {
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok || !res.headers.get("content-type")?.startsWith("image/"))
          return;
        out.set(url, new Uint8Array(await res.arrayBuffer()));
      } catch {
        // Без аватарки: в кружке инициалы.
      }
    }),
  );
  return out;
}
