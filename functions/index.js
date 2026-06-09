// VIC English — Cloud Functions
// Requer: firebase-admin, firebase-functions v5+, Node 20

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule }         = require("firebase-functions/v2/scheduler");
const { initializeApp }      = require("firebase-admin/app");
const { getMessaging }       = require("firebase-admin/messaging");
const { getFirestore }       = require("firebase-admin/firestore");

initializeApp();

const OWNER_UID = "BPj6R6IH5naAcW0SWcZglXL7pEy2";

// ── HELPERS ───────────────────────────────────────────────────────────────────

async function collectTokens(db, onlyNotPracticedToday = false) {
  const today = new Date().toISOString().slice(0, 10);
  const snap  = await db.collection("users").get();
  const tokens = [];
  const staleTokensByUser = {};

  snap.forEach(docSnap => {
    const d   = docSnap.data();
    const uid = docSnap.id;
    if (!d.fcmTokens?.length) return;
    if (onlyNotPracticedToday) {
      const practiced = (d.practicedDays || []).includes(today);
      if (practiced) return;
    }
    tokens.push(...d.fcmTokens);
    staleTokensByUser[uid] = d.fcmTokens;
  });

  return { tokens, staleTokensByUser };
}

async function sendInBatches(messaging, tokens, notification, webpushLink) {
  const BATCH = 500;
  let sent = 0, failed = 0;
  const staleTokens = [];

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    const result = await messaging.sendEachForMulticast({
      tokens: batch,
      notification,
      webpush: {
        fcmOptions: { link: webpushLink || "https://app.viclanguage.com.br" },
        notification: {
          icon:    "https://app.viclanguage.com.br/logo_full_2.png",
          badge:   "https://app.viclanguage.com.br/vic_lamp.png",
          vibrate: [200, 100, 200],
          requireInteraction: false,
        },
      },
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "vic_reminders" },
      },
    });

    sent   += result.successCount;
    failed += result.failureCount;

    // Collect invalid tokens to clean up
    result.responses.forEach((resp, idx) => {
      if (!resp.success && (
        resp.error?.code === "messaging/registration-token-not-registered" ||
        resp.error?.code === "messaging/invalid-registration-token"
      )) {
        staleTokens.push(batch[idx]);
      }
    });
  }

  return { sent, failed, staleTokens };
}

async function cleanStaleTokens(db, staleTokens) {
  if (!staleTokens.length) return;
  const staleSet = new Set(staleTokens);
  const snap = await db.collection("users").get();
  const batch = db.batch();

  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (!d.fcmTokens?.length) return;
    const cleaned = d.fcmTokens.filter(t => !staleSet.has(t));
    if (cleaned.length !== d.fcmTokens.length) {
      batch.update(docSnap.ref, { fcmTokens: cleaned });
    }
  });

  await batch.commit().catch(() => {});
}

// ── 1. ENVIO MANUAL DO ADMIN ──────────────────────────────────────────────────
// Chamado do painel admin no app. Só o OWNER_UID pode chamar.
exports.sendPushToAll = onCall({ region: "us-central1" }, async (request) => {
  if (request.auth?.uid !== OWNER_UID) {
    throw new HttpsError("permission-denied", "Acesso negado.");
  }

  const { title, body, url = "https://app.viclanguage.com.br" } = request.data;
  if (!title || !body) throw new HttpsError("invalid-argument", "title e body são obrigatórios.");

  const db        = getFirestore();
  const messaging = getMessaging();

  const { tokens, staleTokensByUser } = await collectTokens(db, false);
  if (!tokens.length) return { sent: 0, failed: 0, total: 0 };

  const { sent, failed, staleTokens } = await sendInBatches(
    messaging,
    tokens,
    { title, body },
    url
  );

  await cleanStaleTokens(db, staleTokens);

  console.log(`sendPushToAll: sent=${sent} failed=${failed} total=${tokens.length}`);
  return { sent, failed, total: tokens.length };
});

// ── 2. LEMBRETE DIÁRIO AGENDADO ───────────────────────────────────────────────
// Roda todo dia às 19h (horário de Brasília = UTC-3 → 22:00 UTC)
// Envia apenas para usuários que NÃO praticaram hoje.
exports.dailyReminder = onSchedule(
  { schedule: "0 22 * * *", region: "us-central1", timeZone: "UTC" },
  async () => {
    const db        = getFirestore();
    const messaging = getMessaging();

    const { tokens } = await collectTokens(db, true); // só quem não praticou
    if (!tokens.length) {
      console.log("dailyReminder: todos praticaram hoje 🎉");
      return;
    }

    const messages = [
      { title: "VIC English 📚", body: "Você não praticou hoje! Seu streak está em risco 🔥" },
      { title: "VIC English ⚡", body: "15 minutos por dia mudam tudo. Vamos lá!" },
      { title: "VIC English 🎯", body: "Não perca sua sequência! Uma missão rápida agora." },
      { title: "VIC English 🌟", body: "Seu inglês profissional não vai esperar. Pratique agora!" },
      { title: "VIC English 🚀", body: "Cada dia que você pratica, fica mais perto do emprego dos sonhos." },
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];

    const { sent, failed, staleTokens } = await sendInBatches(messaging, tokens, msg);
    await cleanStaleTokens(db, staleTokens);

    console.log(`dailyReminder: sent=${sent} failed=${failed} total=${tokens.length}`);
  }
);

// ── 3. LEMBRETE DE STREAK EM RISCO ───────────────────────────────────────────
// Roda às 22h (UTC 01:00) — última chance antes da meia-noite
exports.streakWarning = onSchedule(
  { schedule: "0 1 * * *", region: "us-central1", timeZone: "UTC" },
  async () => {
    const db        = getFirestore();
    const messaging = getMessaging();

    // Só quem tem streak > 2 e não praticou hoje
    const today = new Date().toISOString().slice(0, 10);
    const snap  = await db.collection("users").get();
    const tokens = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (!d.fcmTokens?.length) return;
      const streak    = d.streak || 0;
      const practiced = (d.practicedDays || []).includes(today);
      if (streak >= 3 && !practiced) tokens.push(...d.fcmTokens);
    });

    if (!tokens.length) return;

    const { sent, failed, staleTokens } = await sendInBatches(
      messaging,
      tokens,
      {
        title: "⚠️ Streak em risco!",
        body:  "Você tem um streak ativo e ainda não praticou hoje. Não deixe acabar!",
      }
    );
    await cleanStaleTokens(db, staleTokens);
    console.log(`streakWarning: sent=${sent} failed=${failed} total=${tokens.length}`);
  }
);
