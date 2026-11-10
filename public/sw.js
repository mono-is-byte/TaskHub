/* TaskHub service worker — standards-based PWA updates & caching.
   Generated at build time (scripts/generate-version.mjs). Do not hand-edit. */
const BUILD_VERSION = "build-1794298075412";
const CACHE_PREFIX = "taskhub";
const CACHE_NAME = CACHE_PREFIX + "-" + BUILD_VERSION;
const RUNTIME_NAV_CACHE = CACHE_PREFIX + "-nav-" + BUILD_VERSION;

const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/icon-192.png?v=2",
  "/icon-512.png?v=2",
  "/icon-maskable-512.png?v=2",
  "/apple-touch-icon.png?v=2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
  // Do not skipWaiting here: the page controls activation (SKIP_WAITING message)
  // so updates can be applied safely without interrupting active use.
});

self.addEventListener("message", (event) => {
  if (event && event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((key) => {
            if (key.startsWith(CACHE_PREFIX + "-") && key !== CACHE_NAME && key !== RUNTIME_NAV_CACHE) {
              return caches.delete(key);
            }
            // Drop stale runtime nav caches from other builds.
            if (key.startsWith(CACHE_PREFIX + "-nav-") && key !== RUNTIME_NAV_CACHE) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        );
      } catch (_) {}
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname)
  );
}

function isCacheFirstAsset(pathname) {
  // Hashed build assets are immutable; other static files are safe to cache-first.
  return (
    pathname.startsWith("/_next/static/") ||
    /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|svg|ico)$/.test(pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Never intercept API/auth/personalized data or SSE streams.
  const accept = req.headers.get("accept") || "";
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/change-password") ||
    url.pathname.startsWith("/forgot-password") ||
    url.pathname.startsWith("/no-access") ||
    accept.includes("text/event-stream")
  ) {
    return;
  }

  // Service worker script & version: always go to network so updates are detected.
  if (url.pathname === "/sw.js" || url.pathname === "/version.json") {
    event.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match(req)));
    return;
  }

  // Manifest: network-first (revalidate) so icon/theme changes propagate.
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        } catch (_) {
          const cached = await caches.match(req);
          if (cached) return cached;
          throw _;
        }
      })()
    );
    return;
  }

  // Navigations (HTML): Network First. Cache successful responses for offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME_NAV_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        } catch (_) {
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallback = await caches.match("/login");
          if (fallback) return fallback;
          return Response.error();
        }
      })()
    );
    return;
  }

  // Hashed/static assets: Cache First.
  if (isCacheFirstAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        } catch (_) {
          const fallback = await caches.match(req);
          if (fallback) return fallback;
          throw _;
        }
      })()
    );
    return;
  }

  // Other same-origin GETs (e.g. non-hashed public files): network-first with cache fallback.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        } catch (_) {
          const cached = await caches.match(req);
          if (cached) return cached;
          throw _;
        }
      })()
    );
  }
  // Everything else: default browser/network behavior.
});
