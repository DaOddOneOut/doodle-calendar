// Offline cache. The publish workflow bumps VERSION on every deploy so installed copies update.
const VERSION = "dc-v2";
const nums = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const CORE = [
  "./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "fonts/DancingScript_700Bold.ttf", "fonts/Nunito_600SemiBold.ttf", "fonts/Nunito_800ExtraBold.ttf",
  "icons/icon-192.png", "icons/icon-512.png",
  ...nums.map((n) => `art/still/${n}.webp`),
  ...nums.map((n) => `art/anim/${n}.webm`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Videos are requested in byte ranges; serve the whole cached file instead.
  if (url.pathname.endsWith(".webm")) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const key = url.origin + url.pathname;
      let r = await c.match(key);
      if (!r) {
        r = await fetch(key);
        if (r.ok && r.status === 200) c.put(key, r.clone());
      }
      return r;
    }));
    return;
  }

  // Everything else: network first so updates arrive, cache when offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok && r.status === 200) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
