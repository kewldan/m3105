import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { TAG } from "@/lib/api/tags";

/**
 * Сброс кеша публичного контента. Дёргает Go-API после админских изменений
 * (`POST http://web:3000/api/revalidate` во внутренней сети, снаружи путь
 * уходит в Go через nginx и сюда не попадает).
 *
 * Тело: `{ "tags": ["notes", "home"] }`, заголовок `Authorization: Bearer <REVALIDATE_TOKEN>`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_TOKEN;
  if (!secret) {
    return NextResponse.json(
      { error: "REVALIDATE_TOKEN не настроен" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Неверный токен" }, { status: 401 });
  }

  let tags: unknown;
  try {
    tags = (await req.json())?.tags;
  } catch {
    return NextResponse.json({ error: "Ожидался JSON" }, { status: 400 });
  }
  if (!Array.isArray(tags)) {
    return NextResponse.json(
      { error: "Ожидался массив tags" },
      { status: 400 },
    );
  }

  const known = new Set<string>(Object.values(TAG));
  const applied = tags.filter(
    (t): t is string => typeof t === "string" && known.has(t),
  );
  // { expire: 0 } — вызов идёт из вебхука, а не из server action: данные должны
  // протухнуть сразу, без выдачи устаревшего контента (см. доку revalidateTag).
  for (const tag of applied) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: applied });
}
