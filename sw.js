/* Service Worker — Check list SD (mobile PWA) */
const CACHE = 'sd-checklist-v3';
const SHELL = [
  './',
  './interactive_checklist_sd_mobile.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './shared/firebase-config.js',
  './shared/identity.js',
  './shared/app-core.js',
  './shared/sync-engine.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // App document: network-first (fresh build), fall back to cache offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./interactive_checklist_sd_mobile.html')))
    );
    return;
  }

  // Sync/config modules: network-first, so config or logic changes reach
  // already-installed clients without waiting on a cache-name bump.
  if (new URL(req.url).pathname.includes('/shared/')) {
    event.respondWith(
      fetch(req)
        .then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (incl. CDN assets): cache-first, then network + cache.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const cp = res.clone();
      caches.open(CACHE).then((c) => c.put(req, cp));
      return res;
    }).catch(() => cached))
  );
});
