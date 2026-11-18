/**
 * Runs once when the server process starts. Только боевой сервер: в dev
 * прогрев мешал бы при каждом перезапуске, а при сборке API недоступен.
 * `MDX_WARMUP=false` выключает.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.MDX_WARMUP === "false") return;
  const { warmMdxCache } = await import("@/lib/mdx/warmup");
  // Не ждём: сервер должен начать отвечать сразу.
  void warmMdxCache();
}
