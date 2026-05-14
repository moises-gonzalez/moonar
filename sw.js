// moonar service worker.
// Strategy: cache-first for the app shell, network-update in background.
// Bump VERSION on every release to invalidate old caches.

const VERSION = 'moonar-v0.7.2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/icon-180.png',
];

// --- install: precache the shell ----------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// --- activate: drop old caches, claim clients ---------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// --- fetch: cache-first, then network with cache-update -----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(VERSION).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => cached); // offline + not cached → return whatever match gave us

      // Cache-first: serve cached immediately if we have it.
      return cached || fetched;
    })
  );
});
