// Client-side AES-GCM encryption for locked notes.
// Key is derived from the user-provided PIN + a per-note random salt
// using PBKDF2 (200k iterations, SHA-256). The PIN is never stored.

const ENC_PREFIX = "enc:v1:"; // marks an encrypted payload

async function deriveKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function genSaltB64(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...salt));
}

export interface LockPayload {
  title: string;
  content: string;
  images: string[];
}

export async function encryptNote(pin: string, payload: LockPayload): Promise<{ cipher: string; salt: string }> {
  const salt = genSaltB64();
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv);
  combined.set(ct, iv.length);
  const b64 = btoa(String.fromCharCode(...combined));
  return { cipher: ENC_PREFIX + b64, salt };
}

export async function decryptNote(pin: string, cipher: string, salt: string): Promise<LockPayload | null> {
  if (!cipher.startsWith(ENC_PREFIX) || !salt) return null;
  try {
    const b64 = cipher.slice(ENC_PREFIX.length);
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const key = await deriveKey(pin, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export function isEncrypted(content: string | null | undefined): boolean {
  return !!content && content.startsWith(ENC_PREFIX);
}
