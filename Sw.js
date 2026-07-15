// PrepPilot AI — Service Worker (basic app-shell caching for V1)
// Full offline data sync is a Version 3 goal; this V1 worker just makes the
// shell installable and load instantly on repeat visits.

const CACHE_NAME = 'preppilot-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/api.js',
  './js/app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never cache API calls to Apps Script — always go to network.
  if (req.url.includes('script.google.com')) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match('./index.html')))
  );
});