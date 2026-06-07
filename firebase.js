// firebase.js — VIC English — reescrito do zero

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  browserLocalPersistence,
  setPersistence,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD1wmTcVhOFiR8xY3jBDb-mJbd1mDRuCgU",
  authDomain: "victor-app-aef3c.firebaseapp.com",
  projectId: "victor-app-aef3c",
  storageBucket: "victor-app-aef3c.firebasestorage.app",
  messagingSenderId: "313048271409",
  appId: "1:313048271409:web:a01a5a25add0a5e7eee310",
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── Firebase Cloud Messaging ──────────────────────────────────────────────────
// VAPID key — gere no Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
export const VAPID_KEY = "COLE_SUA_VAPID_KEY_AQUI";

let _messaging = null;
function getMsg() {
  if (!_messaging) {
    try { _messaging = getMessaging(app); } catch(e) {}
  }
  return _messaging;
}

// Registra o token FCM do dispositivo e salva no Firestore do usuário
export async function registerFCMToken(uid) {
  try {
    // Se VAPID key não foi configurada, pular silenciosamente
    if (!VAPID_KEY || VAPID_KEY === "COLE_SUA_VAPID_KEY_AQUI") {
      console.info("FCM: VAPID key não configurada — push notifications desativadas");
      return null;
    }
    if (!("Notification" in window)) return null;
    if (Notification.permission !== "granted") return null;
    const msg = getMsg();
    if (!msg) return null;

    const token = await getToken(msg, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    });

    if (token) {
      // Salva token no Firestore — array para suportar múltiplos dispositivos
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      const existing = snap.data()?.fcmTokens || [];
      if (!existing.includes(token)) {
        await updateDoc(userRef, {
          fcmTokens: [...existing, token],
          lastTokenUpdate: serverTimestamp(),
        }).catch(() => setDoc(userRef, {
          fcmTokens: [token],
          lastTokenUpdate: serverTimestamp(),
        }, { merge: true }));
      }
      console.log("✅ FCM token registrado");
      return token;
    }
  } catch(e) {
    console.warn("FCM token error:", e.message);
  }
  return null;
}

// Receber notificação com app ABERTO (foreground)
export function onForegroundMessage(callback) {
  const msg = getMsg();
  if (!msg) return () => {};
  return onMessage(msg, callback);
}

// Keep user logged in permanently — even after closing the app
setPersistence(auth, browserLocalPersistence).catch(()=>{});

export const OWNER_UID = "BPj6R6IH5naAcW0SWcZglXL7pEy2";

const gProvider = new GoogleAuthProvider();

// ── AUTH ──────────────────────────────────────────────
export async function registerUser(email, password, name, username="") {
  const c = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(c.user, { displayName: name }).catch(()=>{});
  try{
    await createUserDoc(c.user.uid, { name, email, provider: "email", username: username||name });
  }catch(firestoreErr){
    console.error("Firestore createUserDoc failed:", firestoreErr.code, firestoreErr.message);
    // Auth user was created successfully — Firestore will be retried by loadDashboard.
    // Don't throw, just log. The user can proceed.
  }
  return c.user;
}

export async function loginUser(email, password) {
  const c = await signInWithEmailAndPassword(auth, email, password);
  return c.user;
}

export async function loginWithGoogle() {
  const c = await signInWithPopup(auth, gProvider);
  const snap = await getDoc(doc(db, "users", c.user.uid));
  if (!snap.exists()) {
    await createUserDoc(c.user.uid, {
      name: c.user.displayName || "Usuário",
      email: c.user.email || "",
      provider: "google",
    });
  }
  return c.user;
}

export async function loginAnonymous() {
  const c = await signInAnonymously(auth);
  const snap = await getDoc(doc(db, "users", c.user.uid));
  if (!snap.exists()) {
    await createUserDoc(c.user.uid, { name: "Visitante", email: "", provider: "anonymous" });
  }
  return c.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── FIRESTORE ─────────────────────────────────────────
async function createUserDoc(uid, extra) {
  await setDoc(doc(db, "users", uid), {
    xp: 0, streak: 0, completedMissions: [],
    plan: "free", createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    currentMission: { segmentId: "maritimo", phaseId: "f1", missionId: "vocab_basico", phraseIndex: 0 },
    ...extra,
  });
}

export async function getUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) return { uid, ...snap.data() };
    return null;
  } catch (e) {
    console.error("getUserData error:", e);
    return null;
  }
}

export async function saveProgress(uid, updates) {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...updates,
      lastSeen: serverTimestamp(),
    });
  } catch (e) {
    // If doc doesn't exist, create it
    try {
      await setDoc(doc(db, "users", uid), {
        ...updates,
        lastSeen: serverTimestamp(),
      }, { merge: true });
    } catch (e2) {
      console.error("saveProgress error:", e2);
    }
  }
}

export async function getAllUsers() {
  const q = query(collection(db, "users"), orderBy("lastSeen", "desc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function getUserById(uid) {
  return getUserData(uid);
}
