import { STORE_OUTBOX, idbGetAll, idbPutAll, idbDelete } from '@/lib/offline/idb';
import { STORE_SCHEDULE } from '@/lib/pwa/offline-schedule';

const SYNC_TAG = 'routineos-sync';

export interface OutboxItem {
  localId?: number;
  idempotencyKey: string;
  url: string;
  method: string;
  body: any;
  headers?: Record<string, string>;
  createdAt: number;
  retryCount: number;
  lastAttempt?: number;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
}

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
}

/**
 * Queue an action for offline sync
 */
export async function queueOfflineAction(
  url: string,
  method: string,
  body: any,
  idempotencyKey: string,
  headers?: Record<string, string>
): Promise<void> {
  if (typeof window === 'undefined') return;

  const item: OutboxItem = {
    idempotencyKey,
    url,
    method,
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
    createdAt: Date.now(),
    retryCount: 0,
    status: 'pending',
  };

  await idbPutAll(STORE_OUTBOX, [item]);
  
  // Register background sync
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register(SYNC_TAG);
      }
    } catch {
      // Background sync not available
    }
  }
  
  // Also try immediate sync if online
  if (navigator.onLine) {
    scheduleSync();
  }
}

/**
 * Flush the outbox - called on reconnect or periodically
 */
export async function flushOutbox(): Promise<SyncResult> {
  if (typeof window === 'undefined') return { synced: 0, failed: 0, conflicts: 0 };

  const items = await idbGetAll<OutboxItem>(STORE_OUTBOX).catch(() => []);
  const pendingItems = items.filter(i => i.status === 'pending' || i.status === 'syncing');
  
  if (pendingItems.length === 0) {
    return { synced: 0, failed: 0, conflicts: 0 };
  }

  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  for (const item of pendingItems) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 60s (max)
    const backoffMs = Math.min(1000 * Math.pow(2, item.retryCount), 60000);
    const timeSinceLastAttempt = item.lastAttempt ? Date.now() - item.lastAttempt : Infinity;
    
    if (item.retryCount > 0 && timeSinceLastAttempt < backoffMs) {
      continue; // Not time to retry yet
    }

    if (item.retryCount > 10) {
      // Max retries exceeded, mark as failed permanently
      await idbDelete(STORE_OUTBOX, item.localId!);
      conflicts++;
      continue;
    }

    // Update status to syncing
    await idbPutAll(STORE_OUTBOX, [{ ...item, status: 'syncing', lastAttempt: Date.now() }]);

    try {
      const response = await fetch(item.url, {
        method: item.method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
          ...item.headers,
        },
        body: JSON.stringify(item.body),
      });

      if (response.ok) {
        // Success - remove from outbox
        await idbDelete(STORE_OUTBOX, item.localId!);
        synced++;
      } else if (response.status === 409 || response.status === 400) {
        // Conflict or bad request - don't retry, remove
        await idbDelete(STORE_OUTBOX, item.localId!);
        conflicts++;
      } else if (response.status >= 500 || response.status === 408 || response.status === 429) {
        // Server error - increment retry count
        await idbPutAll(STORE_OUTBOX, [{ 
          ...item, 
          status: 'pending', 
          retryCount: item.retryCount + 1,
          lastAttempt: Date.now(),
        }]);
        failed++;
        break; // Stop on server error, will retry later
      } else {
        // Other client error - don't retry
        await idbDelete(STORE_OUTBOX, item.localId!);
        conflicts++;
      }
    } catch (error) {
      // Network error - increment retry count
      await idbPutAll(STORE_OUTBOX, [{ 
        ...item, 
        status: 'pending', 
        retryCount: item.retryCount + 1,
        lastAttempt: Date.now(),
      }]);
      failed++;
      break; // Stop on network error
    }
  }

  if (synced > 0) {
    console.log(`[sync-engine] Synced ${synced} offline action(s)`);
  }

  return { synced, failed, conflicts };
}

/**
 * Handle conflict resolution for sync
 * Server wins for timestamps, client wins for user confirmations
 */
export async function resolveSyncConflict(
  serverData: any,
  localData: any,
  entityType: string
): Promise<'server' | 'client' | 'merge'> {
  // For user confirmations (sleep, routine completion), client wins
  if (entityType === 'sleep-confirmation' || entityType === 'routine-completion') {
    return 'client';
  }
  
  // For timestamps, server wins (more authoritative)
  if (entityType === 'timestamp') {
    return 'server';
  }
  
  // Default: try to merge
  return 'merge';
}

/**
 * Schedule a sync attempt
 */
let syncScheduled = false;

export function scheduleSync(): void {
  if (syncScheduled || typeof window === 'undefined') return;
  
  syncScheduled = true;
  
  // Try immediate sync
  setTimeout(async () => {
    syncScheduled = false;
    if (navigator.onLine) {
      await flushOutbox();
    }
  }, 0);
}

/**
 * Listen for online/offline events
 */
export function setupSyncListeners(): () => void {
  if (typeof window === 'undefined') return () => {};
  
  const handleOnline = () => {
    console.log('[sync-engine] Online - flushing outbox');
    scheduleSync();
  };
  
  const handleOffline = () => {
    console.log('[sync-engine] Offline - queueing actions locally');
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Get pending sync count for UI
 */
export async function getPendingSyncCount(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  
  const items = await idbGetAll<OutboxItem>(STORE_OUTBOX).catch(() => []);
  return items.filter(i => i.status === 'pending' || i.status === 'syncing').length;
}

/**
 * Clear completed/failed items older than 24 hours
 */
export async function cleanupOutbox(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  
  const items = await idbGetAll<OutboxItem>(STORE_OUTBOX).catch(() => []);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let cleaned = 0;
  
  for (const item of items) {
    if ((item.status === 'completed' || item.status === 'failed') && 
        item.createdAt < cutoff) {
      await idbDelete(STORE_OUTBOX, item.localId!);
      cleaned++;
    }
  }
  
  return cleaned;
}