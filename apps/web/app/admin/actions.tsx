"use server";

import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { MdxBody } from "@/components/site/mdx-content";
import { apiServer } from "@/lib/api/client";
import { renderMdx } from "@/lib/mdx/render";

async function requireAdmin(): Promise<void> {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  try {
    await apiServer("/auth/me", { headers: { cookie: cookieHeader } });
  } catch {
    throw new Error("Требуется вход в админку");
  }
}

/** Renders MDX for the admin editor preview. Only for authenticated admins. */
export async function previewMdx(source: string): Promise<ReactNode> {
  await requireAdmin();
  const rendered = await renderMdx(source);
  return <MdxBody rendered={rendered} size="sm" />;
}
