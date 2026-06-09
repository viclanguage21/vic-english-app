// Service Worker — VIC English PWA v4 — FCM + OneSignal + Persistent Push
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD1wmTcVhOFiR8xY3jBDb-mJbd1mDRuCgU",
  authDomain: "victor-app-aef3c.firebaseapp.com",
  projectId: "victor-app-aef3c",
  storageBucket: "victor-app-aef3c.firebasestorage.app",
  messagingSenderId: "313048271409",
  appId: "1:313048271409:web:a01a5a25add0a5e7eee310",
});

const messaging = firebase.messaging();

const CACHE = "vic-english-v5";
const NOTIF_CACHE = "vic-notif-v1";         // separate cache — never deleted on SW update
const NOTIF_KEY   = "/vic-pending-notif";   // synthetic key for the scheduled payload

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

// ── ACTIVATE — keep NOTIF_CACHE intact across SW updates ─────────────────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== NOTIF_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── PERSISTENT NOTIF HELPERS ──────────────────────────────────────────────────
// Stores scheduled notification in Cache Storage so it survives SW termination.
// Checked on every fetch and on every push event — fires as soon as the SW
// wakes up for any reason after the target time.

async function savePendingNotif(fireAt, title, body) {
  const c = await caches.open(NOTIF_CACHE);
  await c.put(
    NOTIF_KEY,
    new Response(JSON.stringify({ fireAt, title, body }), {
      headers: { "Content-Type": "application/json" },
    })
  );
}

async function checkPendingNotif() {
  try {
    const c = await caches.open(NOTIF_CACHE);
    const r = await c.match(NOTIF_KEY);
    if (!r) return;
    const data = await r.json();
    if (Date.now() >= data.fireAt) {
      await c.delete(NOTIF_KEY);   // fire only once
      await self.registration.showNotification(data.title, {
        body:  data.body,
        icon:  "/logo_full_2.png",
        badge: "/vic_lamp.png",
        tag:   "vic-scheduled-" + Date.now(),
        requireInteraction: false,
        vibrate: [100, 50, 100],
        data: { url: "/" },
      });
    }
  } catch (_) {}
}

// ── FETCH — network-first with 4s timeout ─────────────────────────────────────
const FETCH_TIMEOUT = 4000;

function fetchWithTimeout(request) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("sw-timeout")), FETCH_TIMEOUT)
    )
  ]);
}

self.addEventListener("fetch", e => {
  // Every fetch wakes the SW — use it to check if a notification is due.
  // This fires the 7pm reminder even when the app was closed and re-opened later,
  // or when any background network request restarts the SW.
  checkPendingNotif();

  if (e.request.url.includes("firebase") ||
      e.request.url.includes("google") ||
      e.request.url.includes("gstatic") ||
      e.request.url.includes("anthropic") ||
      e.request.method !== "GET") return;

  e.respondWith(
    fetchWithTimeout(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(c => c || caches.match("/index.html")))
  );
});

// ── FCM: receber push com app FECHADO (background) ────────────────────────────
messaging.onBackgroundMessage(payload => {
  // FCM push also wakes the SW — check pending local notif too
  checkPendingNotif();
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

// ── NOTIFICAÇÕES AGENDADAS (via postMessage do app) ───────────────────────────
// Dual strategy: setTimeout fires if SW stays alive; Cache fires on next SW wake.
self.addEventListener("message", e => {
  if (e.data?.type === "SCHEDULE_NOTIF") {
    const { delay, title, body } = e.data;
    const fireAt = Date.now() + delay;

    // 1) Persist to Cache Storage — survives SW termination
    savePendingNotif(fireAt, title, body);

    // 2) setTimeout — fires immediately if SW is still alive at target time
    setTimeout(async () => {
      // Clear Cache so the check on fetch doesn't double-fire
      const c = await caches.open(NOTIF_CACHE);
      await c.delete(NOTIF_KEY);
      self.registration.showNotification(title, {
        body,
        icon:  "/logo_full_2.png",
        badge: "/vic_lamp.png",
        tag:   "vic-scheduled-" + Date.now(),
        requireInteraction: false,
        vibrate: [100, 50, 100],
        data: { url: "/" },
      });
    }, delay);
  }

  // Cancel a scheduled notification (e.g. user completed all missions after scheduling)
  if (e.data?.type === "CANCEL_NOTIF") {
    caches.open(NOTIF_CACHE).then(c => c.delete(NOTIF_KEY));
  }
});
