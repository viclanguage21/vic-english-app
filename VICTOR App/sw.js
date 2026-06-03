// Service Worker — VIC English PWA
const CACHE = "vic-english-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/data.js",
  "/firebase.js",
  "/sounds.js",
  "/vic_logo.png",
  "/vic_lamp.png",
  "/vic_speech.png",
  "/manifest.json"
];

// Install — cache all assets
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — remove old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache first, then network
self.addEventListener("fetch", e => {
  // Skip Firebase and external requests
  if (e.request.url.includes("firebase") ||
      e.request.url.includes("google") ||
      e.request.url.includes("gstatic")) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        // Cache new resources
        if (response.ok && e.request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match("/index.html"))
  );
});
