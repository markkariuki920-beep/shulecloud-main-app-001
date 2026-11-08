/* ShuleCloud offline shell cache. Never cache API responses, auth pages, or mutation requests. */
const CACHE = "shulecloud-shell-v3";
const STATIC_EXT = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(["/", "/favicon.png", "/shulecloud-logo.png"]);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("shulecloud-shell-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/~oauth") ||
    url.pathname === "/auth" ||
    url.pathname.startsWith("/reset-password")
  )
    return;
  if (STATIC_EXT.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }
  // The authenticated route is client-rendered (ssr:false). Cache only its empty shell, never API data.
  if (request.mode === "navigate" && url.pathname === "/dashboard") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put("/dashboard", response.clone());
          return response;
        } catch {
          return (await cache.match("/dashboard")) || (await cache.match("/")) || Response.error();
        }
      })(),
    );
  }
});
