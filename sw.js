// Study Timer service worker: caches the app so it opens offline.
// Bump CACHE_VERSION whenever you change any of the files below.
const CACHE_VERSION = 'v9';
const CACHE = 'study-timer-' + CACHE_VERSION;

const CORE = [
  './',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

// Must match the <link href> for the fonts in index.html exactly.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Doto:wght@400;700&family=Space+Mono:wght@400;700&display=swap';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);

    try {
      const res = await fetch(FONT_CSS);
      if (res.ok) {
        const css = await res.clone().text();
        await cache.put(FONT_CSS, res);
        const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, '')))];
        await Promise.all(urls.map((u) =>
          fetch(u).then((r) => (r.ok ? cache.put(u, r) : null)).catch(() => {})
        ));
      }
    } catch (_) { /* fonts optional */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network-first for HTML pages so updates show immediately; cache-first for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const allowed = url.origin === location.origin ||
                  url.hostname === 'fonts.googleapis.com' ||
                  url.hostname === 'fonts.gstatic.com';
  if (!allowed) return;

  // HTML navigation: network-first, fallback to cache
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && (fresh.ok || fresh.type === 'opaque')) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        }
      } catch (_) {}
      const cached = await caches.match('index.html');
      if (cached) return cached;
      return Response.error();
    })());
    return;
  }

  // Static assets: cache-first with network update
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);

    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      try { event.waitUntil(network); } catch (_) {}
      return cached;
    }
    const res = await network;
    if (res) return res;
    return Response.error();
  })());
});
