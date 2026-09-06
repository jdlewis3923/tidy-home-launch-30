// Tidy Pro — push handling, imported by the generated service worker.
// Notification display and click routing only; no caching logic lives here.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "Tidy", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Tidy";
  const options = {
    body: data.body || "",
    icon: "/pro-icon-192.png",
    badge: "/pro-icon-192.png",
    vibrate: [120, 60, 120],
    data: { url: data.url || "/pro/schedule" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/pro/schedule";
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
