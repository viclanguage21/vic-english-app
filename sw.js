// Service Worker — VIC English PWA v3
const CACHE = "vic-english-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./firebase.js",
  "./sounds.js",
  "./manifest.json",
  "./logo_full_2.png",
  "./new_logo_big.png",
  "./vic_lamp.png",
  "./vic_speech.png",
  "./app_icon.png"
];

// Install — cache assets
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS).catch(err => console.warn("Cache partial:", err)))
  );
});

// Activate — clean old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback
self.addEventListener("fetch", e => {
  // Skip non-GET and Firebase requests
  if(e.request.method !== "GET") return;
  if(e.request.url.includes("firestore.googleapis.com")) return;
  if(e.request.url.includes("identitytoolkit.googleapis.com")) return;
  if(e.request.url.includes("firebase")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful responses
        if(res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
