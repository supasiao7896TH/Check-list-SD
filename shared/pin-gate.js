// UI-only gate for destructive actions (delete/clear/reset/import). Not a
// real security boundary — firestore.rules does not check this PIN, so a
// client that bypasses the UI (e.g. calling the Firestore SDK directly) is
// not blocked. This only stops accidental/casual destructive clicks.
const PIN_HASH_HEX = "0a1d18a485f77dcee53ea81f1010276b67153b745219afc4eac4288045f5ca3d";
const UNLOCK_KEY = "sd_pin_gate_unlocked";

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPin(candidate) {
  return (await sha256Hex(candidate)) === PIN_HASH_HEX;
}

export function isUnlocked() {
  return localStorage.getItem(UNLOCK_KEY) === "1";
}

export function unlock() {
  localStorage.setItem(UNLOCK_KEY, "1");
}

export function lock() {
  localStorage.removeItem(UNLOCK_KEY);
}
