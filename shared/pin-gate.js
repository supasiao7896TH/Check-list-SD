// UI-only gate for "edit mode" (App.isEditingAllowed / App.handlePinSubmit).
// Not a real security boundary — firestore.rules does not check this PIN, so
// a client that bypasses the UI (e.g. calling the Firestore SDK directly) is
// not blocked. This only stops a casual viewer from editing/checking items
// without knowing the shared PIN.
const PIN_HASH_HEX = "f40a6d35e0c4605f83be77d8c3a72a1260fd5b056f10052f40fb0ff7089825e8";

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPin(candidate) {
  return (await sha256Hex(candidate)) === PIN_HASH_HEX;
}
