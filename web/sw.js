// Offline cache. Bump VERSION whenever files in /web change so phones pick up the update.
const VERSION = "dc-v1";
const CORE = [
  "./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "fonts/DancingScript_700Bold.ttf", "fonts/Nunito_600SemiBold.ttf", "fonts/Nunito_800ExtraBold.ttf",
  "icons/icon-192.png", "icons/icon-512.png",
  ...Array.from({ length: 12 }, (_, i) => `art/${String(i + 1).padStart(2, "0")}.webp`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // never cache GitHub API calls
  // network first for the app shell so updates arrive; cache fallback when offline
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
