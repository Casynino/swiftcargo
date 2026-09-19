/*
  THE SMALLEST SERVICE WORKER THAT MAKES THIS INSTALLABLE.

  Android only offers "Install app" to a site that registers one. It caches
  nothing on purpose: an ERP that serves a stale page shows a clerk a figure
  that is no longer true, which is worse than any offline convenience. Every
  request goes to the network exactly as it would without this file.
*/
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
