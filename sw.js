// KILL-SWITCH SERVICE WORKER. KEEP THIS FILE PUBLISHED at /workout-tracker/sw.js.
//
// The Ledger web app was shut down on 16 November 2026. Before that, it registered a service
// worker at this same URL (./sw.js, scope /workout-tracker/) that cached the whole app and
// served it offline, so a phone or browser that installed it keeps opening the old app without
// asking the network. Browsers check this URL for a new worker when the page is opened, and
// roughly hourly while an old copy is open. This file is what they find now. It replaces the
// old worker and then:
//   1. skips waiting, so it takes over without a message from the page (the old app only
//      activated an update after a "SKIP_WAITING" message from its Reload button);
//   2. deletes every Cache Storage cache, so nothing of the old app is served again;
//   3. claims the open pages and navigates each one to its own address, so an open copy loads
//      the landing page from the network instead of staying on the old app;
//   4. unregisters itself.
// It has no fetch handler, so every request goes to the network.
//
// It never touches the browser's stored site data (the database and key-value storage the app
// kept its log in), only Cache Storage. The log a person saved in their browser stays there,
// and would come back if the app were ever published again.
//
// Do not delete this file, and do not rename it: an installed copy that is never given a
// worker to replace its old one would keep serving the old app for good. Each step below is
// wrapped, so one failure does not stop the rest.

self.addEventListener('install', () => {
  try {
    self.skipWaiting();
  } catch (e) {
    // Nothing to do: activation then waits for the old worker's pages to close.
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key).catch(() => false)));
      } catch (e) {
        // Caches may be unavailable; carry on.
      }

      try {
        await self.clients.claim();
      } catch (e) {
        // Carry on: unregistering still ends this worker once its pages close.
      }

      try {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.all(
          windows.map(async client => {
            try {
              await client.navigate(client.url);
            } catch (e) {
              // A page that cannot be navigated is left alone.
            }
          })
        );
      } catch (e) {
        // Carry on to unregister.
      }

      try {
        await self.registration.unregister();
      } catch (e) {
        // Nothing more to do.
      }
    })()
  );
});
