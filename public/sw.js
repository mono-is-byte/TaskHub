/* TaskHub service worker — minimal PWA support.
   - Precaches the app shell + static assets.
   - Network-only for API/auth/SSE (real-time updates must work).
   - Navigation requests fall back to the network, then cached shell.
   - Auto-updates: new SW activates immediately on deploy. */
const CACHE_NAME = "taskhub-shell-v2";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache API, auth, or SSE/event-stream requests — network only.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth") ||
      req.headers.get("accept") === "text/event-stream" ||
      req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

  // Navigation requests: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r || caches.match(req)))
    );
    return;
  }

  // Static assets: cache-first, then network.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});