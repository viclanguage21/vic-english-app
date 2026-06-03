// firebase.js — VIC English v11

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD1wmTcVhOFiR8xY3jBDb-mJbd1mDRuCgU",
  authDomain: "victor-app-aef3c.firebaseapp.com",
  projectId: "victor-app-aef3c",
  storageBucket: "victor-app-aef3c.firebasestorage.app",
  messagingSenderId: "313048271409",
  appId: "1:313048271409:web:a01a5a25add0a5e7eee310",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ─── OWNER UID — só você vê o dashboard do professor ─────────────────────────
// Cole aqui o seu UID do Firebase (Authentication > seu usuário > User UID)
export const OWNER_UID = "BPj6R6IH5naAcW0SWcZglXL7pEy2";

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export async function registerUser(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await _createUserDoc(cred.user.uid, { name, email, provider:"email" });
  return cred.user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  // create doc only if new user
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await _createUserDoc(user.uid, {
      name:     user.displayName || "Usuário Google",
      email:    user.email || "",
      provider: "google",
    });
  }
  return user;
}

export async function loginAnonymous() {
  const cred = await signInAnonymously(auth);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists()) {
    await _createUserDoc(cred.user.uid, {
      name:     "Visitante",
      email:    "",
      provider: "anonymous",
    });
  }
  return cred.user;
}

export async function logoutUser() { await signOut(auth); }

export function onAuthChange(cb) { return onAuthStateChanged(auth, cb); }

async function _createUserDoc(uid, extra) {
  await setDoc(doc(db, "users", uid), {
    xp: 0, level: 1, streak: 0,
    completedMissions: [],
    currentMission: { segmentId:"maritimo", phaseId:"f1", missionId:"vocab_basico", phraseIndex:0 },
    createdAt: serverTimestamp(),
    lastSeen:  serverTimestamp(),
    plan: "free",   // "free" | "pro"
    ...extra,
  });
}

// ─── FIRESTORE ────────────────────────────────────────────────────────────────
export async function getUserData(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function saveProgress(uid, updates) {
  await updateDoc(doc(db, "users", uid), {
    ...updates,
    lastSeen: serverTimestamp(),
  });
}

// ─── ADMIN — só o dono usa ────────────────────────────────────────────────────
export async function getAllUsers() {
  const q = query(collection(db, "users"), orderBy("lastSeen","desc"), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function getUserById(uid) {
  return getUserData(uid);
}
