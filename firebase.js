// firebase.js — VIC English — reescrito do zero

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  setPersistence,
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

// ── Safari/iOS: detectar se é WebKit/Safari ──────────────────────────────────
export const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  || /iPad|iPhone|iPod/.test(navigator.userAgent);

// Keep user logged in permanently — IndexedDB first (more stable on iOS), fallback localStorage
setPersistence(auth, indexedDBLocalPersistence)
  .catch(() => setPersistence(auth, browserLocalPersistence))
  .catch(() => {});

// ── Handle redirect result (Safari Google Login) ─────────────────────────────
export async function handleGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      const snap = await getDoc(doc(db, "users", result.user.uid));
      if (!snap.exists()) {
        await createUserDoc(result.user.uid, {
          name: result.user.displayName || "Usuário",
          email: result.user.email || "",
          provider: "google",
        });
      }
      return result.user;
    }
  } catch (e) {
    console.warn("getRedirectResult error:", e.message);
  }
  return null;
}

export const OWNER_UID = "BPj6R6IH5naAcW0SWcZglXL7pEy2";

const gProvider = new GoogleAuthProvider();

// ── AUTH ──────────────────────────────────────────────
export async function registerUser(email, password, name) {
  const c = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(c.user, { displayName: name });
  await createUserDoc(c.user.uid, { name, email, provider: "email" });
  return c.user;
}

export async function loginUser(email, password) {
  const c = await signInWithEmailAndPassword(auth, email, password);
  return c.user;
}

export async function loginWithGoogle() {
  // Safari/iOS: popup falha em WebViews e versões antigas — usar redirect
  if (isSafari) {
    await signInWithRedirect(auth, gProvider);
    return null; // página vai recarregar, resultado capturado em handleGoogleRedirectResult
  }
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
