const CACHE_NAME = 'cnh-pwa-v1.0.22';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/config.js',
  '/data.json',
  '/manifest.webmanifest',
  '/assets/favicon.png',
  '/assets/logo-cnh-real.jpg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/apple-touch-icon.png',
  '/assets/placeholder-boat.svg',
  '/plan-reference.png',
  '/plan%20emplacements.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key !== CACHE_NAME ? caches.delete(key) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Les données synchronisées ne doivent pas être servies depuis le cache (sécurisées).
  if (url.pathname.startsWith('/.netlify/functions/data') || url.pathname.startsWith('/api/data') || url.pathname.startsWith('/.netlify/functions/auth') || url.pathname.startsWith('/api/auth')) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation : réseau d'abord, cache si hors-ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets statiques : cache d'abord, puis réseau.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
