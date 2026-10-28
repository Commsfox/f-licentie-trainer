// Service worker voor de PWA: eerst het netwerk (altijd de nieuwste versie), offline uit de cache.
// shortcut: alleen wat je al eens geopend hebt werkt offline; vooraf alles cachen als offline-leren belangrijk wordt.
const CACHE = 'flic-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'img/logo/app-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(fetch(e.request)
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
