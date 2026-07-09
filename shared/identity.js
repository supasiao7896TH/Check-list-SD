import { getFirebaseApp, SDK_BASE } from "./firebase-config.js";

const NAME_KEY = "sd_checklist_display_name";
const LOCAL_UID_KEY = "sd_checklist_local_uid";

function randomLocalUid() {
  return "local-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getLocalUid() {
  let uid = localStorage.getItem(LOCAL_UID_KEY);
  if (!uid) {
    uid = randomLocalUid();
    localStorage.setItem(LOCAL_UID_KEY, uid);
  }
  return uid;
}

export function getStoredName() {
  return localStorage.getItem(NAME_KEY) || "";
}

export function setStoredName(name) {
  localStorage.setItem(NAME_KEY, (name || "").trim());
}

export function promptRequired() {
  return !getStoredName();
}

let currentUid = getLocalUid();

export function getIdentity() {
  return { uid: currentUid, name: getStoredName() };
}

// Attempts anonymous Firebase sign-in. Never throws — on any failure
// (offline, placeholder config, blocked auth) the app keeps using the
// locally-generated uid so attribution metadata stays well-formed.
export async function signInAnon() {
  try {
    const app = await getFirebaseApp();
    const { getAuth, signInAnonymously, onAuthStateChanged } = await import(
      `${SDK_BASE}/firebase-auth.js`
    );
    const auth = getAuth(app);
    const cred = await signInAnonymously(auth);
    currentUid = cred.user.uid;
    return { uid: currentUid };
  } catch (err) {
    console.warn("[identity] anonymous sign-in unavailable, staying local-only:", err);
    return { uid: currentUid };
  }
}
