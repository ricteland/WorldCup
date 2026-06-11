// Minimal service worker: network-first everywhere, cache as offline fallback.
// Never cache-first for /_next/static/ — dev chunk names are stable across
// rebuilds, so serving them from cache hands old JS to a new server (hydration
// mismatches). Online, the browser's HTTP cache already handles immutable
// production chunks; the SW cache only needs to cover offline.
const CACHE = "wc26-v3";
const STATIC = [
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/logo.svg",
  "/assets/TwemojiCountryFlags.woff2",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // network-first with cache fallback for navigation
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then((hit) => hit || caches.match("/matches")))
    );
  }
});
