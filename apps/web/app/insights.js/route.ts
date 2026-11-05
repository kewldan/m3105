import { connection } from "next/server";

/**
 * Loads the Umami tracker (stats.kewldan.ru) when `UMAMI_WEBSITE_ID` is set.
 * Read at request time: the id comes from the server's .env, not from the
 * image. The tracker and its reports go through this domain (`/u/`, see
 * deploy/nginx), so CSP stays `'self'` and blockers of third-party trackers
 * leave it alone; Do Not Track is respected. Only the public site loads it,
 * the admin panel is not tracked.
 *
 * The recorder adds replays and heatmaps; whether it records, how often and
 * what it masks is set per site in Umami (Websites → Edit → Replays). It
 * starts once the tracker has a session, so Do Not Track stops it too.
 */
export async function GET() {
  await connection();
  const id = process.env.UMAMI_WEBSITE_ID?.trim() ?? "";
  const body = /^[0-9a-f-]{36}$/.test(id)
    ? `(() => {
  for (const file of ["script.js", "recorder.js"]) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = "/u/" + file;
    s.dataset.websiteId = ${JSON.stringify(id)};
    s.dataset.hostUrl = location.origin + "/u";
    s.dataset.doNotTrack = "true";
    document.head.appendChild(s);
  }
})();`
    : "";
  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
