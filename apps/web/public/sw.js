/**
 * Service worker сайта М3105.
 *
 * Задача одна: прочитанные конспекты открываются в метро без связи.
 * Стратегии:
 *   - /_next/static и шрифты — cache-first, они неизменяемые;
 *   - страницы (навигация и RSC-переходы) — network-first с откатом в кеш,
 *     а если и в кеше пусто, показываем /offline;
 *   - картинки из вложений (/api/v1/files/…) — cache-first: по id файл
 *     никогда не меняется, а без них конспект со схемами офлайн неполный;
 *   - всё остальное (API, админка, POST) не трогаем вовсе.
 */
const VERSION = "v2";
const SHELL = `m3105-shell-${VERSION}`;
const PAGES = `m3105-pages-${VERSION}`;
const ASSETS = `m3105-assets-${VERSION}`;
const FILES = `m3105-files-${VERSION}`;
const OFFLINE_URL = "/offline";
/** Сколько страниц держим офлайн: примерно семестр конспектов. */
const PAGES_LIMIT = 80;
/** Картинок из вложений — с запасом на иллюстрации тех же конспектов. */
const FILES_LIMIT = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL, PAGES, ASSETS, FILES].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Ключ кеша: RSC-ответ для того же адреса — это другой ответ, чем HTML. */
function cacheKey(request) {
  const url = new URL(request.url);
  if (request.headers.get("RSC") === "1") url.searchParams.set("__rsc", "1");
  return new Request(url.toString(), { headers: request.headers });
}

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) {
    await cache.delete(key);
  }
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // 206 (Range) в кеш не кладётся, да и не нужен.
  if (response.status === 200) {
    cache.put(request, response.clone());
    if (limit) trim(cacheName, limit);
  }
  return response;
}

async function networkFirst(request) {
  const key = cacheKey(request);
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(key, response.clone());
      trim(PAGES, PAGES_LIMIT);
    }
    return response;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/v1/files/") &&
    request.destination === "image"
  ) {
    event.respondWith(cacheFirst(request, FILES, FILES_LIMIT));
    return;
  }
  // API, админка и служебные маршруты кешировать нельзя: там личные данные
  // и мутации.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/og/")
  ) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (request.mode === "navigate" || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request));
  }
});
