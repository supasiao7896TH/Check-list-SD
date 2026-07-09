// Firebase config — REPLACE the values below with your real project's config
// (Firebase console > Project settings > General > Your apps > SDK setup).
// Until replaced, the app runs fully offline/local-only: every Firebase call
// fails fast and is caught by callers, so nothing here blocks normal use.
export const firebaseConfig = {
  apiKey: "AIzaSyBowajC6YOzC15268kVW_qSe-HB_74yUtg",
  authDomain: "t-dispatcher-465104-r2.firebaseapp.com",
  projectId: "t-dispatcher-465104-r2",
  storageBucket: "t-dispatcher-465104-r2.firebasestorage.app",
  messagingSenderId: "1010939345148",
  appId: "1:1010939345148:web:e7724076c75176af3fbf79",
};

const SDK_VERSION = "10.12.2";
export const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

export function isPlaceholderConfig() {
  return firebaseConfig.apiKey === "REPLACE_WITH_REAL_FIREBASE_CONFIG";
}

let appPromise = null;

// Lazily initializes (and memoizes) the Firebase App singleton so
// identity.js and sync-engine.js never double-initialize it.
export function getFirebaseApp() {
  if (isPlaceholderConfig()) {
    return Promise.reject(new Error("Firebase config is still a placeholder"));
  }
  if (!appPromise) {
    appPromise = import(`${SDK_BASE}/firebase-app.js`).then(({ initializeApp }) =>
      initializeApp(firebaseConfig)
    );
  }
  return appPromise;
}
