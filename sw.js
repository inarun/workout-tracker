const CACHE_NAME = 'workout-v10-5-2';

// The app shell. These are same-origin and must all cache for the PWA to work offline.
const PRECACHE_URLS = ['./', './index.html', './bundle.js?v=10.5.2', './manifest.json', './icon-192.png', './icon-512.png'];

// Nice to have, but third-party. Kept out of the atomic batch below.
//
// React and react-dom are load-bearing, not decorative: without them the bundle has no
// globals to run against and the app paints nothing. They are still here rather than in
// PRECACHE_URLS because they are cross-origin — one blocked CDN would fail the whole
// atomic install and leave the PWA with no offline shell at all. Before they were listed,
// a first visit installed the worker only after the page had already fetched React from
// the network cache, so install-then-offline launched to a blank screen until the next
// online load. Keep these two in step with the script tags in index.html.
const OPTIONAL_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
];

self.addEventListener('install', e => {
  // No skipWaiting() here: the new worker waits until the page opts in via
  // the SKIP_WAITING message (in-app "Update available" banner), so an active
  // session is never swapped to a new bundle mid-use.
  //
  // cache.addAll is all-or-nothing, so listing these cross-origin scripts alongside
  // the shell meant any network that blocks or drops one (corporate proxy, DNS
  // filtering, a flaky moment) failed the whole install. On a first visit that left
  // the PWA with no offline capability at all; on an existing install the new worker
  // never reached "installed", so the update banner never appeared and the user was
  // stranded on the old bundle with no signal. The CDN scripts are now best-effort.
  e.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache =>
        cache
          .addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })))
          .then(() => Promise.all(OPTIONAL_URLS.map(u => cache.add(u).catch(() => {}))))
      )
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('workout-v') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Navigation: network-first with cache fallback. A navigation that carries a query
  // string is not cached under it: Google's sign-in callback lands here with a one-time
  // code in the URL, and the only copy of that URL should be the one the page scrubs.
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok && !url.search) {
            const clone = resp.clone();
            e.waitUntil(caches.open(CACHE_NAME).then(c => c.put(e.request, clone)));
          }
          return resp;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // bundle.js: network-first with query-param-agnostic cache fallback
  if (url.pathname.endsWith('/bundle.js') || url.pathname === '/bundle.js') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            e.waitUntil(caches.open(CACHE_NAME).then(c => c.put(e.request, clone)));
          }
          return resp;
        })
        .catch(async () => {
          // Try exact match first, then strip query params
          const cached = await caches.match(e.request);
          if (cached) return cached;
          const cache = await caches.open(CACHE_NAME);
          const keys = await cache.keys();
          const bundleKey = keys.find(k => new URL(k.url).pathname.endsWith('/bundle.js'));
          return bundleKey ? cache.match(bundleKey) : caches.match(e.request);
        })
    );
    return;
  }

  // Everything else: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          e.waitUntil(caches.open(CACHE_NAME).then(c => c.put(e.request, clone)));
        }
        return resp;
      });
    })
  );
});
