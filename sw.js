const CACHE = "parking-gate-v21";
const FILES = [
  "./",
  "./index.html",
  "./style.css?v=210",
  "./api.js?v=210",
  "./camera.js?v=210",
  "./app.js?v=210",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((k) =>
        Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const x = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, x));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
