import "server-only";

import { cookies } from "next/headers";

/** Serialises the incoming request cookies for forwarding to the Go API. */
export async function cookieHeader(): Promise<string | undefined> {
  const jar = await cookies();
  const raw = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return raw || undefined;
}
