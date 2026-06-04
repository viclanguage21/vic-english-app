// Service Worker — VIC English PWA v3 — FCM + Push
// IMPORTANTE: Firebase Messaging precisa do importScripts abaixo

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Mesma config do firebase.js
firebase.initializeApp({
  apiKey: "AIzaSyD1wmTcVhOFiR8xY3jBDb-mJbd1mDRuCgU",
  authDomain: "victor-app-aef3c.firebaseapp.com",
  projectId: "victor-app-aef3c",
  storageBucket: "victor-app-aef3c.firebasestorage.app",
  messagingSenderId: "313048271409",
  appId: "1:313048271409:web:a01a5a25add0a5e7eee310",
});

const messaging = firebase.messaging();

const CACHE = "vic-english-v3";
const ASSETS = [
  "/", "/index.html", "/style.css", "/app.js", "/data.js",
  "/firebase.js", "/sounds.js", "/vic_logo.png", "/vic_lamp.png",
  "/vic_speech.png", "/logo_full_2.png", "/manifest.json"
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS).catch(() => {}))
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
          caches.open(CACHE).then(cache => cache.put(e.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match("/index.html")))
  );
});

// ── FCM: receber push com app FECHADO (background) ────────────────────────────
// O Firebase Messaging SDK cuida disso automaticamente via messaging.onBackgroundMessage
messaging.onBackgroundMessage(payload => {
  console.log("📩 Push recebido em background:", payload);
  const { title = "VIC English 📚", body = "Hora de praticar!", icon } = payload.notification || {};
  return self.registration.showNotification(title, {
    body,
    icon: icon || "/logo_full_2.png",
    badge: "/vic_lamp.png",
    tag: "vic-push-" + Date.now(),
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: { url: payload.data?.url || "/" },
  });
});

// ── CLIQUE NA NOTIFICAÇÃO ─────────────────────────────────────────────────────
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

// ── NOTIFICAÇÕES LOCAIS AGENDADAS (via postMessage do app) ────────────────────
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
