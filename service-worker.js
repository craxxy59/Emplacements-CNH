const CACHE_NAME = 'cnh-pwa-cache-v16';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './config.example.js',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/logo-cnh.svg',
  './assets/logo-cnh-real.jpg',
  './assets/icon-192.svg',
  './assets/icon-512.svg',
  './assets/placeholder-boat.svg',
  './assets/plan-reference.png',
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  return APP_SHELL.some((asset) => pathname.endsWith(asset.replace('./', '/')));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Important: ne jamais mettre en cache les appels API externes (ex: Supabase).
  if (!isSameOrigin(request)) {
    event.respondWith(fetch(request));
    return;
  }

  // Pour la navigation HTML, on privilégie le réseau pour toujours récupérer la dernière version.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // App shell en réseau d'abord, cache en secours.
  if (isAppShellRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // Pour les autres assets locaux, cache d'abord puis réseau.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    }),
  );
});
