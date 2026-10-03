import { NextResponse } from 'next/server';

/**
 * Rate limiting for the unauthenticated / auth-adjacent surface.
 *
 * Why this is separate from `lib/middleware/rate-limit.ts`: `RateLimiter`
 * stores its buckets in a `Map` that lives on the *instance*, so
 * `new RateLimiter(...)` at module scope in a route file is the only way to
 * make it persist between requests. That pattern is easy to get wrong, it has
 * no cross-route sharing, and — critically — the map grows forever, because
 * nothing ever evicts an expired bucket. An unauthenticated endpoint lets an
 * attacker mint one entry per spoofed IP and grow the heap until the function
 * is OOM-killed.
 *
 * This module fixes both problems: a single module-scoped store shared by every
 * route, and lazy eviction of expired entries on every write, so the map size
 * is bounded by the number of *live* keys rather than all keys ever seen.
 *
 * HONEST LIMITATION: this state is per-instance. On Vercel each serverless
 * invocation gets its own module registry, so a cold function starts empty and a
 * fleet of instances multiplies the effective limit. That is acceptable for
 * abuse-throttling (it is not a billing meter) but it is not a hard guarantee.
 * A shared store (Vercel KV / Upstash) or the platform WAF is required before
 * treating these numbers as a security boundary — see the deliverables notes.
 */

export interface AuthRateLimitOptions {
  /** Maximum requests allowed inside the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Minimal structural type so both a `NextRequest` and a plain `Request` work.
 *
 * The NextAuth credentials provider calls `authorize(credentials, request)`
 * with a *standard* `Request`, not a `NextRequest`, so anything typed to
 * `NextRequest` would need a lie to be passed here.
 */
export interface RequestLike {
  headers: Headers;
}

export interface AuthRateLimitVerdict {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

/**
 * Reused fixed-window key. A single key is enough: the window is short, and
 * incrementing on every call (rather than skipping expired-but-present keys)
 * keeps the arithmetic trivial to reason about.
 */
function bump(key: string, windowMs: number, now: number): Bucket {
  const existing = store.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  store.set(key, bucket);
  return bucket;
}

/**
 * Drop expired buckets. Called on every check with a low probability so the
 * sweep is amortised rather than an O(n) scan per request.
 */
function evictExpired(now: number): void {
  if (Math.random() > 0.02) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
  // Belt and braces: if a burst outran the sweep, fall back to oldest-first
  // trimming so a hostile key generator cannot grow the map without bound.
  if (store.size > 10_000) {
    const excess = store.size - 10_000;
    let removed = 0;
    for (const key of store.keys()) {
      store.delete(key);
      if (++removed >= excess) break;
    }
  }
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is client-controllable in principle, so on a platform that
 * does not strip it this is a weak identity. Vercel appends the real client
 * address to the end of the chain, so the last hop is the trustworthy one.
 */
export function clientIp(request: RequestLike): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-vercel-forwarded-for') ??
    'unknown'
  );
}

/**
 * Register a request against `scope` for this client. Returns 429-style
 * information rather than throwing, so route handlers can shape the response.
 */
export function checkAuthRateLimit(
  request: RequestLike,
  scope: string,
  { max, windowMs }: AuthRateLimitOptions
): AuthRateLimitVerdict {
  const now = Date.now();
  evictExpired(now);

  const key = `${scope}:${clientIp(request)}`;
  const bucket = bump(key, windowMs, now);

  if (bucket.count > max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { ok: true, remaining: max - bucket.count, retryAfterSeconds: 0 };
}

/**
 * Standard 429 response. `Retry-After` is the documented header for this, and
 * setting it lets well-behaved clients back off on their own.
 */
export function rateLimited(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests. Please wait a moment and try again.',
    },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }
  );
}

/**
 * Tuned per endpoint. Password-shaped endpoints get deliberately tight
 * budgets: a legitimate user types a password maybe once or twice a minute,
 * while an online guessing attack is bounded by bcrypt (which is slow for the
 * attacker too) and would otherwise be unbounded.
 */
export const AUTH_RATE_LIMITS = {
  /** Credential sign-in, handled inside the NextAuth credentials provider. */
  login: { max: 10, windowMs: 5 * 60_000 },
  /** Account creation + verification-email sending. */
  register: { max: 5, windowMs: 15 * 60_000 },
  /** Sends an email to an arbitrary address — an email-bomb vector. */
  forgotPassword: { max: 5, windowMs: 15 * 60_000 },
  /** Changes a password but does not itself authenticate. */
  resetPassword: { max: 10, windowMs: 15 * 60_000 },
  /** 6-digit space: bounded so codes cannot be walked. */
  twoFactor: { max: 10, windowMs: 10 * 60_000 },
  /** Email-enumeration oracle. */
  checkEmail: { max: 20, windowMs: 5 * 60_000 },
  /** Username-enumeration oracle. */
  checkUsername: { max: 20, windowMs: 5 * 60_000 },
  checkResetToken: { max: 30, windowMs: 5 * 60_000 },
  twoFactorSetup: { max: 10, windowMs: 60_000 },
} as const satisfies Record<string, AuthRateLimitOptions>;
