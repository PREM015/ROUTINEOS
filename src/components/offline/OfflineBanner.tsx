'use client';

import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { syncQueue } from '@/lib/offline/queue';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      setSyncing(true);
      
      try {
        const result = await syncQueue();
        console.log('Synced:', result);
      } catch (error) {
        console.error('Sync failed:', error);
      } finally {
        setSyncing(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !syncing) {
    return null;
  }

  if (syncing) {
    return (
      <Banner variant="info">
        Syncing your changes...
      </Banner>
    );
  }

  return (
    <Banner variant="warning">
      You're offline. Changes will be synced when you reconnect.
    </Banner>
  );
}