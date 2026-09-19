/**
 * Dashboard Cache
 * Fast path for frequently re-queried dashboard snapshots.
 */

import { TTLCache } from './analytics-cache';

const dashboardCache = new TTLCache();

const DASHBOARD_TTL_MS = 60 * 1000;

/**
 * Compute or return a cached dashboard snapshot for a single user.
 */
export async function getCachedDashboard<T>(
  userId: string,
  computeFn: () => Promise<T>,
  ttlMs: number = DASHBOARD_TTL_MS
): Promise<T> {
  return dashboardCache.getOrCompute(`dashboard:${userId}`, computeFn, ttlMs);
}

/**
 * Read a previously cached dashboard result without computing.
 */
export function getDashboardCache<T>(userId: string): T | undefined {
  return dashboardCache.get(`dashboard:${userId}`) as T | undefined;
}

/**
 * Store a dashboard result directly.
 */
export function setDashboardCache<T>(
  userId: string,
  value: T,
  ttlMs: number = DASHBOARD_TTL_MS
): void {
  dashboardCache.set(`dashboard:${userId}`, value, ttlMs);
}

/**
 * Invalidate cached dashboard data. Pass a user ID to target a specific
 * user, or omit to clear every cached dashboard.
 */
export function invalidateDashboard(userId?: string): void {
  if (userId === undefined) {
    dashboardCache.invalidate();
    return;
  }
  dashboardCache.invalidate(`dashboard:${userId}`);
}

/**
 * Clear the dashboard cache entirely.
 */
export function clearDashboardCache(): void {
  dashboardCache.clear();
}