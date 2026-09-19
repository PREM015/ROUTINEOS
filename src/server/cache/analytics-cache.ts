/**
 * Analytics Cache
 * In-memory TTL cache backing the analytics modules to avoid recomputing
 * heavy aggregation on every request.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Minimal thread-safe-friendly TTL cache with FIFO eviction when the entry
 * count exceeds `maxEntries`. Expired entries are pruned lazily.
 */
export class TTLCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;

  constructor(options: { maxEntries?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
  }

  private now(): number {
    return Date.now();
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  get(key: string): T | undefined {
    this.prune();
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.prune();
    if (this.store.size >= this.maxEntries) {
      const eldest = this.store.keys().next().value;
      if (eldest !== undefined) {
        this.store.delete(eldest);
      }
    }
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async getOrCompute<TValue extends T>(
    key: string,
    computeFn: () => Promise<TValue>,
    ttlMs: number
  ): Promise<TValue> {
    const cached = this.get(key);
    if (cached !== undefined) return cached as TValue;
    const value = await computeFn();
    this.set(key, value, ttlMs);
    return value;
  }

  invalidate(key?: string | RegExp): void {
    if (key === undefined) {
      this.store.clear();
      return;
    }
    if (key instanceof RegExp) {
      for (const cachedKey of this.store.keys()) {
        if (key.test(cachedKey)) {
          this.store.delete(cachedKey);
        }
      }
      return;
    }
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    this.prune();
    return this.store.size;
  }
}

const analyticsCache = new TTLCache();

const ANALYTICS_TTL_MS = 5 * 60 * 1000;

/**
 * Compute or return a cached analytics value keyed by user and date range.
 */
export async function getCachedAnalytics<T>(
  userId: string,
  from: string,
  to: string,
  computeFn: () => Promise<T>,
  ttlMs: number = ANALYTICS_TTL_MS
): Promise<T> {
  return analyticsCache.getOrCompute(`analytics:${userId}:${from}:${to}`, computeFn, ttlMs);
}

/**
 * Read a previously cached analytics result for a user/date range without
 * computing a fresh value.
 */
export function getAnalyticsCache<T>(
  userId: string,
  from: string,
  to: string
): T | undefined {
  return analyticsCache.get(`analytics:${userId}:${from}:${to}`) as T | undefined;
}

/**
 * Store an analytics result directly, bypassing a compute function.
 */
export function setAnalyticsCache<T>(
  userId: string,
  from: string,
  to: string,
  value: T,
  ttlMs: number = ANALYTICS_TTL_MS
): void {
  analyticsCache.set(`analytics:${userId}:${from}:${to}`, value, ttlMs);
}

/**
 * Drop cached analytics. Without a userId every user's analytics is cleared.
 */
export function invalidateAnalyticsCache(userId?: string): void {
  if (userId === undefined) {
    analyticsCache.invalidate();
    return;
  }
  analyticsCache.invalidate(new RegExp(`^analytics:${userId}:`));
}

/**
 * Clear the analytics cache entirely.
 */
export function clearAnalyticsCache(): void {
  analyticsCache.clear();
}