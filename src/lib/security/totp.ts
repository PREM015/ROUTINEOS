import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) + 2FA state helpers.
 *
 * These live in `lib/` rather than in `auth.service.ts` because the LOGIN path
 * has to read them: `authorize` in `lib/auth.ts` is the only place that can
 * decide whether a verified password is enough to mint a session, and
 * `auth.service.ts` imports `auth` from `lib/auth.ts`, so anything the login
 * path needs cannot live inside the service. Nothing here touches Prisma or
 * NextAuth — the state helpers operate on the raw `preferences` JSON string, so
 * the module stays importable from anywhere on the server.
 *
 * Deliberately dependency-free: no new package, same SHA-1/6-digit/30-second
 * parameters the existing authenticator enrollments were issued with, so
 * already-enrolled users keep working untouched.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const TOTP_DIGITS = 6;
const TOTP_PERIOD_MS = 30_000;
/** Accept the previous, current and next window to tolerate clock drift. */
const TOTP_DRIFT_WINDOWS = [-1, 0, 1] as const;

export interface TwoFactorState {
  enabled: boolean;
  secret: string | null;
  verifiedAt: string | null;
}

export function encodeBase32(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of Buffer.from(input)) {
    value = ((value << 8) | byte) & 0xffffffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(input: string): Buffer {
  const clean = input.replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 secret');
    value = ((value << 5) | index) & 0xffffffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate a 6-digit TOTP code for a secret at a time window.
 */
export function generateTotpCode(
  secret: string,
  timestamp: number = Date.now(),
  windowDrift: number = 0
): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / TOTP_PERIOD_MS) + windowDrift;
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    ((digest[offset] ?? 0) & 0x7f) * 0x01000000 +
    ((digest[offset + 1] ?? 0) & 0xff) * 0x010000 +
    ((digest[offset + 2] ?? 0) & 0xff) * 0x0100 +
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Constant-time comparison of a submitted code against the TOTP windows.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) return false;
  const now = Date.now();
  const expected = Buffer.from(code, 'utf8');
  for (const drift of TOTP_DRIFT_WINDOWS) {
    let candidate: Buffer;
    try {
      candidate = Buffer.from(generateTotpCode(secret, now, drift), 'utf8');
    } catch {
      // A corrupt stored secret must fail closed, not throw into the login path.
      return false;
    }
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Build the otpauth:// provisioning URI for authenticator apps.
 */
export function buildOtpauthUrl(secret: string, email: string): string {
  const issuer = 'RoutineOS';
  const account = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_MS / 1000),
  });
  return `otpauth://totp/${account}?${params}`;
}

/**
 * Generate a fresh 160-bit TOTP secret in RFC 4648 base32.
 */
export function generateTwoFactorSecret(): string {
  return encodeBase32(randomBytes(20));
}

/**
 * Parse a `preferences` JSON column without throwing.
 */
export function parsePreferences(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Read stored 2FA state out of a `preferences` JSON column.
 */
export function readTwoFactorState(preferences: string | null): TwoFactorState {
  const prefs = parsePreferences(preferences);
  const authPrefs =
    typeof prefs.auth === 'object' && prefs.auth !== null
      ? (prefs.auth as Record<string, unknown>)
      : {};
  const twoFactor =
    typeof authPrefs.twoFactor === 'object' && authPrefs.twoFactor !== null
      ? (authPrefs.twoFactor as Record<string, unknown>)
      : {};
  return {
    enabled: twoFactor.enabled === true,
    secret: typeof twoFactor.secret === 'string' ? twoFactor.secret : null,
    verifiedAt:
      typeof twoFactor.verifiedAt === 'string' ? twoFactor.verifiedAt : null,
  };
}

/**
 * Serialise updated 2FA state back into a `preferences` JSON column,
 * preserving every other preference key.
 */
export function writeTwoFactorState(
  preferences: string | null,
  state: TwoFactorState
): string {
  const prefs = parsePreferences(preferences);
  const authPrefs =
    typeof prefs.auth === 'object' && prefs.auth !== null
      ? (prefs.auth as Record<string, unknown>)
      : {};
  return JSON.stringify({
    ...prefs,
    auth: {
      ...authPrefs,
      twoFactor: state,
    },
  });
}
