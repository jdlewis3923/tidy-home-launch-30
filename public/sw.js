// One-release cleanup for the former root-scoped Tidy Pro worker.
// It removes only this app's Workbox caches, then unregisters itself so the
// customer dashboard is no longer controlled by the contractor app.
function isLegacyTidyCache(name) {
  return (
    name === "tidy-pages" ||
    name === "tidy-assets" ||
    name === "tidy-images" ||
    (/(^|-)precache-v\d+-|(^|-)runtime-/.test(name) && name.endsWith(self.registration.scope))
  );
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        await Promise.allSettled(cacheNames.filter(isLegacyTidyCache).map((name) => caches.delete(name)));
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(clients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);