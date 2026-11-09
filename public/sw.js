/* TaskHub service worker — minimal PWA support.
   - Dev (localhost): does nothing, so HMR / login redirects are never touched.
   - Precaches only static, non-auth-dependent assets (NOT "/").
   - API / auth / login / SSE / non-GET: left entirely to the browser (network).
   - Navigations: network-first; offline fallback only if cached shell is a
     non-redirected response (prevents redirect loops).
   - Static hashed assets: cache-first.
   - Auto-updates: new SW activates immediately on deploy. */
const CACHE_NAME = "taskhub-shell-v3";
const SHELL = [
  "/manifest.webmanifest",
  "/icon-192.png?v=2",
  "/icon-512.png?v=2",
  "/icon-maskable-512.png?v=2",
];
const IS_DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

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
  // Dev: never intercept anything.
  if (IS_DEV) return;

  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // API, auth, login, SSE, and non-GET: let the browser hit the network directly.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/login") ||
    (req.headers.get("accept") || "").includes("text/event-stream") ||
    req.method !== "GET"
  ) {
    return;
  }

  // Navigation: network-first. Offline fallback only to a non-redirected cached page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match("/");
        return cached && !cached.redirected ? cached : Response.error();
      })
    );
    return;
  }

  // Static assets: cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|svg|ico|woff2?)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
      )
    );
  }
  // Everything else: default browser behavior.
});
