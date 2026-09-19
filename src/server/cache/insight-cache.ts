/**
 * Insight Cache
 * Longer-lived cache for AI-generated insights, keyed by a stable hash so
 * user keys can be invalidated without tracking every generated insight.
 */

import { TTLCache } from './analytics-cache';

const insightCache = new TTLCache();

const INSIGHT_TTL_MS = 60 * 60 * 1000;

/**
 * djb2 string hash used to keep insight cache keys bounded in length.
 */
export function simpleHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Compute or return a cached insight for a user and logical key.
 */
export async function getCachedInsight<T>(
  userId: string,
  key: string,
  computeFn: () => Promise<T>,
  ttlMs: number = INSIGHT_TTL_MS
): Promise<T> {
  return insightCache.getOrCompute(`insights:${userId}:${simpleHash(key)}`, computeFn, ttlMs);
}

/**
 * Read a previously cached insight without computing a fresh value.
 */
export function getInsightCache<T>(userId: string, key: string): T | undefined {
  return insightCache.get(`insights:${userId}:${simpleHash(key)}`) as T | undefined;
}

/**
 * Store an insight result directly.
 */
export function setInsightCache<T>(
  userId: string,
  key: string,
  value: T,
  ttlMs: number = INSIGHT_TTL_MS
): void {
  insightCache.set(`insights:${userId}:${simpleHash(key)}`, value, ttlMs);
}

/**
 * Invalidate cached insights. Pass a user ID to scope the wipe, or omit to
 * clear every cached insight.
 */
export function invalidateInsights(userId?: string): void {
  if (userId === undefined) {
    insightCache.invalidate();
    return;
  }
  insightCache.invalidate(new RegExp(`^insights:${userId}:`));
}

/**
 * Clear the insight cache entirely.
 */
export function clearInsightCache(): void {
  insightCache.clear();
}