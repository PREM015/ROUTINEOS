/**
 * PWA offline helpers.
 * Cache and connectivity utilities for the service worker lifecycle. All
 * functions resolve to safe default values outside the browser.
 */

const isClient = typeof window !== 'undefined';

const DEFAULT_CACHE = 'routineos-cache-v1';

/**
 * Current network status: true when the browser reports connectivity.
 */
export function isOnline(): boolean {
  return isClient ? navigator.onLine : true;
}

export interface ConnectivityStatus {
  online: boolean;
  timestamp: number;
}

/**
 * Snapshot of the current connectivity state.
 */
export function getConnectivityStatus(): ConnectivityStatus {
  return {
    online: isOnline(),
    timestamp: Date.now(),
  };
}

/**
 * Subscribe to connectivity changes. Returns an unsubscribe function.
 */
export function listenToConnectivity(
  callback: (status: ConnectivityStatus) => void
): () => void {
  if (!isClient) return () => undefined;

  const handle = () => callback(getConnectivityStatus());
  window.addEventListener('online', handle);
  window.addEventListener('offline', handle);
  return () => {
    window.removeEventListener('online', handle);
    window.removeEventListener('offline', handle);
  };
}

/**
 * Whether the Cache Storage API is available.
 */
export function canUseCache(): boolean {
  return isClient && 'caches' in window;
}

async function openCache(cacheName: string = DEFAULT_CACHE): Promise<Cache | null> {
  if (!canUseCache()) return null;
  try {
    return await window.caches.open(cacheName);
  } catch {
    return null;
  }
}

/**
 * Pre-cache a URL. Resolves `false` when caching is unavailable.
 */
export async function cacheAsset(
  url: string,
  cacheName?: string
): Promise<boolean> {
  const cache = await openCache(cacheName);
  if (!cache) return false;
  try {
    await cache.add(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pre-cache several URLs. Resolves the count that succeeded.
 */
export async function cacheAssets(urls: readonly string[], cacheName?: string): Promise<number> {
  const cache = await openCache(cacheName);
  if (!cache) return 0;

  let cached = 0;
  await Promise.all(
    urls.map(async url => {
      try {
        await cache.add(url);
        cached += 1;
      } catch {
        // ignore individual failures
      }
    })
  );
  return cached;
}

/**
 * Read a previously cached URL. Resolves `null` when not cached.
 */
export async function readFromCache(
  url: string,
  cacheName?: string
): Promise<Response | null> {
  const cache = await openCache(cacheName);
  if (!cache) return null;
  try {
    return (await cache.match(url)) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove a URL from the cache.
 */
export async function evictFromCache(url: string, cacheName?: string): Promise<boolean> {
  const cache = await openCache(cacheName);
  if (!cache) return false;
  return cache.delete(url);
}