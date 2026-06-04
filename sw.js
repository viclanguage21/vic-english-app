// Service Worker — VIC English PWA v2
const CACHE = "vic-english-v3";
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
  "/logo_full_2.png",
  "/manifest.json"
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(()=>{}))
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH — network-first ─────────────────────────────────────────────────────
self.addEventListener("fetch", e => {
  if (e.request.url.includes("firebase") ||
      e.request.url.includes("google") ||
      e.request.url.includes("gstatic") ||
      e.request.url.includes("anthropic") ||
      e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match("/index.html")))
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
// Recebe push do servidor Firebase Cloud Messaging
self.addEventListener("push", e => {
  let data = { title: "VIC English 📚", body: "Hora de praticar inglês!", icon: "/logo_full_2.png" };
  try { data = { ...data, ...e.data.json() }; } catch(err) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/logo_full_2.png",
      badge: "/vic_lamp.png",
      tag: "vic-english-push",
      requireInteraction: false,
      vibrate: [200, 100, 200],
      data: { url: data.url || "/" }
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ── NOTIFICAÇÕES LOCAIS AGENDADAS (app fechado via SW) ─────────────────────────
// O app envia mensagens para o SW agendar notificações locais
self.addEventListener("message", e => {
  if (e.data?.type === "SCHEDULE_NOTIF") {
    const { delay, title, body } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: "/logo_full_2.png",
        badge: "/vic_lamp.png",
        tag: "vic-scheduled-" + Date.now(),
        vibrate: [100, 50, 100],
      });
    }, delay);
  }
});

