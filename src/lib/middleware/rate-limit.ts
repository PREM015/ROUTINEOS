import type { NextRequest } from 'next/server';
import { RateLimitError } from '@/lib/errors/app-error';

/**
 * Rate limiting middleware for API routes.
 * In-memory fixed-window limiter keyed by identifier.
 */

export interface RateLimitOptions {
  /** Window length in milliseconds (default 60s). */
  windowMs?: number;
  /** Maximum allowed requests per window (default 100). */
  max?: number;
  /** Prefix for generated keys (e.g. per-route namespacing). */
  keyPrefix?: string;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 100;

export class RateLimiter {
  private readonly store = new Map<string, RateLimitBucket>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly keyPrefix: string;

  constructor(options: RateLimitOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.max = options.max ?? DEFAULT_MAX;
    this.keyPrefix = options.keyPrefix ?? 'rl';
  }

  private bucket(key: string, now: number): RateLimitBucket {
    const existing = this.store.get(key);
    if (existing && existing.resetAt > now) return existing;

    const bucket: RateLimitBucket = {
      count: 0,
      resetAt: now + this.windowMs,
    };
    this.store.set(key, bucket);
    return bucket;
  }

  /**
   * Identifier for a request: client IP plus (optionally) the path.
   */
  keyFor(req: NextRequest): string {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    return `${this.keyPrefix}:${ip}`;
  }

  /**
   * Remaining allowance for a key. Negative once the limit is used up.
   */
  remaining(key: string, now: number = Date.now()): number {
    const bucket = this.store.get(key);
    if (!bucket || bucket.resetAt <= now) return this.max;
    return this.max - bucket.count;
  }

  /**
   * Register a request and throw `RateLimitError` when the window is exhausted.
   */
  check(key: string, now: number = Date.now()): void {
    const bucket = this.bucket(key, now);
    const remaining = this.max - bucket.count;
    if (remaining <= 0) {
      throw new RateLimitError('Too many requests. Please try again later.');
    }
    bucket.count += 1;
  }

  /**
   * Reset the budget for a key (e.g. after successful authentication).
   */
  reset(key: string): void {
    this.store.delete(key);
  }
}

export const defaultRateLimiter = new RateLimiter();

/**
 * Wrap a handler with a shared or dedicated rate limiter, keyed by client IP.
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<Response> | Response,
  options: RateLimitOptions = {},
  limiter: RateLimiter = defaultRateLimiter
) {
  return async (req: NextRequest) => {
    const instance = options.windowMs !== undefined || options.max !== undefined
      ? new RateLimiter({ ...options, keyPrefix: options.keyPrefix ?? 'rl' })
      : limiter;
    instance.check(instance.keyFor(req as NextRequest));
    return handler(req);
  };
}