// UI-only gate for "edit mode" (App.isEditingAllowed / App.handlePinSubmit).
// Not a real security boundary — firestore.rules does not check this PIN, so
// a client that bypasses the UI (e.g. calling the Firestore SDK directly) is
// not blocked. This only stops a casual viewer from editing/checking items
// without knowing the shared PIN.
const PIN_HASH_HEX = "0a1d18a485f77dcee53ea81f1010276b67153b745219afc4eac4288045f5ca3d";

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPin(candidate) {
  return (await sha256Hex(candidate)) === PIN_HASH_HEX;
}
