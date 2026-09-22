/**
 * Cryptographic helpers built on the Web Crypto API (`globalThis.crypto`),
 * which is available in modern browsers and Node 18+.
 */

/**
 * Generate a UUID v4 string using `crypto.randomUUID`, optionally prefixed.
 * @example generateId('habit') // 'habit_1deb3f2c-...'
 */
export function generateId(prefix = ''): string {
  const id = globalThis.crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate a cryptographically-random token as a hex string of `2 * length` chars.
 * @example generateToken(16) // 32 hex characters
 */
export function generateToken(length = 32): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * Compute the SHA-256 digest of a string or byte buffer.
 * @example await sha256('hello') // '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
 */
export async function sha256(
  data: string | Uint8Array,
  encoding: 'hex' | 'base64' = 'hex'
): Promise<string> {
  const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input as BufferSource);
  const bytes = new Uint8Array(digest);
  if (encoding === 'base64') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return toHex(bytes);
}

/**
 * Generate `bytes` random bytes and return them as a hex string.
 * @example randomBytesHex(8) // 16 hex characters
 */
export function randomBytesHex(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buffer);
  return toHex(buffer);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}