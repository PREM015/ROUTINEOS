'use client';

import { useCallback, useEffect, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { flushOutbox, pendingCount } from '@/lib/offline/outbox';

/**
 * Offline status, backed by the queue that actually holds data.
 *
 * This previously imported `syncQueue` from `src/lib/offline/queue.ts`, which
 * queues into `localStorage` and whose `queueAction` had **zero call sites** —
 * so the queue was permanently empty and "changes will be synced when you
 * reconnect" was a promise nothing kept.
 *
 * It now reads the IndexedDB outbox, so the pending count shown is the real one
 * and the count drops as items land.
 */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);

  const refreshPending = useCallback(() => {
    void pendingCount().then(setPending).catch(() => setPending(0));
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshPending();

    const handleOnline = async () => {
      setIsOnline(true);
      setSyncing(true);

      try {
        const result = await flushOutbox();
        // `OfflineSync` also mirrors the notification plan on reconnect; both
        // are idempotent and safe to run concurrently.
        if (result.synced > 0 || result.dropped > 0) {
          window.dispatchEvent(new Event('routineos:synced'));
        }
      } catch (error) {
        console.error('Sync failed:', error);
      } finally {
        setSyncing(false);
        refreshPending();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshPending();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // `OfflineSync` flushes on its own `online` listener too; this keeps the
    // banner honest if a background sync completes while the tab is open.
    window.addEventListener('routineos:synced', refreshPending);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('routineos:synced', refreshPending);
    };
  }, [refreshPending]);

  if (isOnline && !syncing) {
    return null;
  }

  if (syncing) {
    return <Banner variant="info">Syncing your changes…</Banner>;
  }

  return (
    <Banner variant="warning">
      {pending > 0
        ? `You're offline. ${pending} change${pending === 1 ? '' : 's'} will sync when you reconnect.`
        : "You're offline. You can keep working — anything you enter is saved and synced later."}
    </Banner>
  );
}
