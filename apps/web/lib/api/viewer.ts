import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { cookieHeader } from "./cookies";
import { getMe } from "./public";
import type { MeResponse } from "./types";

/** Cookie that turns the "only my stream" filter off: value "all". */
export const SCOPE_COOKIE = "edu_scope";

/** The signed-in student, fetched once per request (layout and page share it). */
export const getViewer = cache(async (): Promise<MeResponse | null> => {
  try {
    return await getMe(await cookieHeader());
  } catch {
    return null;
  }
});

export type ViewerScope = {
  /** The viewer's group: a confirmed student's, otherwise empty. */
  group: string;
  /** The viewer chose to see everything. */
  all: boolean;
  /** Group to pass as ?for= — empty when there is nothing to narrow. */
  forGroup: string;
};

/**
 * Whose content the lists show. Guests and unconfirmed accounts see all;
 * a student sees content for everyone, their group and stream unless they
 * switched the filter off.
 */
export const getViewerScope = cache(async (): Promise<ViewerScope> => {
  const [me, jar] = await Promise.all([getViewer(), cookies()]);
  const group = me?.user.approved ? me.user.groupName : "";
  const all = jar.get(SCOPE_COOKIE)?.value === "all";
  return { group, all, forGroup: all ? "" : group };
});
