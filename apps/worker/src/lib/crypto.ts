import type { Env } from '../env';

/**
 * Sensitive-value encryption (AES-GCM), ported from the reference
 * (TCG/mulistreamer-tcg/src/index.ts). Used to encrypt Twitch access/refresh
 * tokens at rest in Supabase. Output is prefixed with `gcm:` to distinguish the
 * scheme, matching the reference so values are interoperable.
 */

/** The secret used for token encryption — dedicated key, or SESSION_SECRET fallback. */
export function encryptionKeySecret(env: Env): string {
  return env.ENCRYPTION_SECRET ?? env.SESSION_SECRET;
}

/** Derive a 256-bit AES-GCM key from a raw secret string via SHA-256. */
async function deriveKey(secret: string, usage: ('encrypt' | 'decrypt')[]): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, usage);
}

/** AES-GCM authenticated encryption. Returns `gcm:<base64(iv||ciphertext)>`. */
export async function encryptSensitive(text: string, secret: string): Promise<string> {
  const key = await deriveKey(secret, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM uses a 12-byte IV
  const data = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return 'gcm:' + btoa(String.fromCharCode(...combined));
}

/** AES-GCM decryption of a value produced by {@link encryptSensitive}. */
export async function decryptSensitive(encryptedBase64: string, secret: string): Promise<string> {
  if (!encryptedBase64.startsWith('gcm:')) {
    throw new Error('Unsupported ciphertext format (expected gcm: prefix)');
  }
  const b64 = encryptedBase64.slice(4);
  const combined = new Uint8Array(atob(b64).split('').map((c) => c.charCodeAt(0)));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const key = await deriveKey(secret, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
