'use client';

/**
 * SyncStatus — connectivity indicator with a pending-change count.
 *
 * Combines the `useOnlineStatus` hook with the number of items queued in
 * localStorage `pendingChanges` to tell the user at a glance whether the app is
 * connected and whether anything is waiting to sync.
 *
 * Usage:
 *   <SyncStatus />
 */

import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';

const PENDING_KEY = 'pendingChanges';

export interface SyncStatusProps {
  className?: string;
}

function readPendingCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function SyncStatus({ className }: SyncStatusProps) {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    setPendingCount(readPendingCount());

    const refresh = () => setPendingCount(readPendingCount());
    const onStorage = (event: StorageEvent) => {
      if (event.key === PENDING_KEY || event.key === null) refresh();
    };

    window.addEventListener('storage', onStorage);
    const id = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="status"
      aria-label={online ? 'Online' : 'Offline'}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full',
          online ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
        )}
      >
        {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      </span>
      <div className="flex flex-col">
        <span className={cn('text-sm font-medium', online ? 'text-green-700' : 'text-red-700')}>
          {online ? 'Online' : 'Offline'}
        </span>
        <span className="text-xs text-gray-400">
          {online
            ? pendingCount > 0
              ? `${pendingCount} pending change${pendingCount === 1 ? '' : 's'}`
              : 'All changes synced'
            : 'Changes will sync on reconnect'}
        </span>
      </div>
      {pendingCount > 0 && (
        <Badge variant={online ? 'warning' : 'danger'} className="ml-1 tabular-nums">
          {pendingCount}
        </Badge>
      )}
    </div>
  );
}

export default SyncStatus;