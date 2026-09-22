"use client";

/**
 * OfflineIndicator — a global banner showing connectivity state. When offline
 * it reports how many changes are queued in localStorage (`pending-changes`,
 * a JSON array), and briefly confirms when connectivity returns.
 *
 * Usage:
 *   <OfflineIndicator />
 */
import * as React from 'react';
import { CloudOff, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const PENDING_CHANGES_KEY = 'routineos:pending-changes';

function readPendingCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(PENDING_CHANGES_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export interface OfflineIndicatorProps {
  className?: string;
}

export default function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = React.useState<number>(() => readPendingCount());
  const [justBack, setJustBack] = React.useState(false);
  const wasOffline = React.useRef(false);

  React.useEffect(() => {
    const refresh = () => setPendingCount(readPendingCount());
    window.addEventListener('storage', refresh);
    window.addEventListener(PENDING_CHANGES_KEY, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(PENDING_CHANGES_KEY, refresh);
    };
  }, []);

  React.useEffect(() => {
    if (online && wasOffline.current) {
      setJustBack(true);
      const timer = window.setTimeout(() => setJustBack(false), 4000);
      wasOffline.current = false;
      return () => window.clearTimeout(timer);
    }
    if (!online) {
      wasOffline.current = true;
      setJustBack(false);
    }
    return undefined;
  }, [online]);

  if (justBack) {
    return (
      <div
        role="status"
        className={`flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 shadow-sm ${className ?? ''}`}
      >
        <CloudOff className="h-4 w-4 shrink-0" />
        Back online — {pendingCount} queued change{pendingCount === 1 ? '' : 's'} will sync shortly.
      </div>
    );
  }

  if (online) return null;

  return (
    <div
      role="alert"
      className={`flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 shadow-sm ${className ?? ''}`}
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      You&apos;re offline.
      {pendingCount > 0 && (
        <span className="font-semibold">
          {pendingCount} queued change{pendingCount === 1 ? '' : 's'} waiting.
        </span>
      )}
    </div>
  );
}