'use client';

/**
 * PendingChanges — offline change queue viewer with manual sync.
 *
 * Reads items persisted under localStorage `pendingChanges` and lets the user
 * retry or sync them individually or all at once. Each item carries a `type`
 * that maps to a real endpoint: HABIT_LOG → POST /api/habits/[id]/log,
 * GOAL_PROGRESS → POST /api/goals/[id]/progress and REFLECTION →
 * POST /api/reflections. Successful items are removed; failures are kept with
 * an inline error so they can be retried.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CloudUpload, ListChecks, RefreshCw, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { cn, getRelativeTime } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

const PENDING_KEY = 'pendingChanges';

interface PendingChange {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
  error?: string;
}

export interface PendingChangesProps {
  className?: string;
}

function loadPending(): PendingChange[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: PendingChange[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== 'string' || typeof record.type !== 'string') continue;
      items.push({
        id: record.id,
        type: record.type,
        data: (record.data ?? {}) as Record<string, unknown>,
        timestamp: typeof record.timestamp === 'number' ? record.timestamp : Date.now(),
        error: typeof record.error === 'string' ? record.error : undefined,
      });
    }
    return items;
  } catch {
    return [];
  }
}

function persist(items: readonly PendingChange[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  } catch {
    // Storage may be unavailable; changes remain in memory only.
  }
}

async function syncOne(item: PendingChange): Promise<void> {
  switch (item.type) {
    case 'HABIT_LOG': {
      const habitId = item.data.habitId;
      if (typeof habitId !== 'string' || habitId.length === 0) {
        throw new Error('Missing habitId in queued change');
      }
      await apiRequest(`/api/habits/${habitId}/log`, { method: 'POST', body: item.data });
      return;
    }
    case 'GOAL_PROGRESS': {
      const goalId = item.data.goalId;
      if (typeof goalId !== 'string' || goalId.length === 0) {
        throw new Error('Missing goalId in queued change');
      }
      await apiRequest(`/api/goals/${goalId}/progress`, { method: 'POST', body: item.data });
      return;
    }
    case 'REFLECTION':
      await apiRequest('/api/reflections', { method: 'POST', body: item.data });
      return;
    default:
      throw new Error(`Unsupported change type: ${item.type}`);
  }
}

export function PendingChanges({ className }: PendingChangesProps) {
  const [items, setItems] = useState<PendingChange[]>([]);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [syncingAll, setSyncingAll] = useState(false);

  useEffect(() => {
    setItems(loadPending());
  }, []);

  const applyResult = useCallback((id: string, error: string | null) => {
    setItems((current) => {
      if (error === null) {
        const next = current.filter((item) => item.id !== id);
        persist(next);
        return next;
      }
      const next = current.map((item) => (item.id === id ? { ...item, error } : item));
      persist(next);
      return next;
    });
  }, []);

  const syncItem = useCallback(
    async (item: PendingChange) => {
      setSyncingIds((current) => new Set(current).add(item.id));
      try {
        await syncOne(item);
        applyResult(item.id, null);
      } catch (err) {
        applyResult(item.id, err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setSyncingIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [applyResult]
  );

  const syncAll = useCallback(async () => {
    if (items.length === 0) return;
    setSyncingAll(true);
    for (const item of items) {
      await syncItem(item);
    }
    setSyncingAll(false);
  }, [items, syncItem]);

  if (items.length === 0) {
    return (
      <Card className={className}>
        <div className="p-6">
          <EmptyState
            icon={<ListChecks className="h-12 w-12 text-gray-300" />}
            title="No pending changes"
            description="Changes made offline will show up here for syncing."
          />
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">Pending Changes</h2>
            <Badge variant="warning">{items.length} queued</Badge>
          </div>
          <Button
            onClick={syncAll}
            disabled={syncingAll || items.length === 0}
            isLoading={syncingAll}
          >
            <CloudUpload className="mr-2 h-4 w-4" />
            {syncingAll ? 'Syncing…' : 'Sync all'}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {items.map((item) => {
            const syncing = syncingIds.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                  item.error ? 'border-red-200 bg-red-50/50' : 'border-gray-200'
                )}
              >
                <Badge variant={item.error ? 'danger' : 'primary'}>{item.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-mono text-xs text-gray-500"
                    title={JSON.stringify(item.data)}
                  >
                    {JSON.stringify(item.data)}
                  </p>
                  <p className="text-xs text-gray-400">{getRelativeTime(new Date(item.timestamp))}</p>
                  {item.error && <p className="mt-0.5 text-xs text-red-600">{item.error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {syncing ? (
                    <Spinner className="h-4 w-4" />
                  ) : item.error ? (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncItem(item)}
                        aria-label={`Retry ${item.type}`}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Retry
                      </Button>
                    </>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {!syncing && !item.error && (
                    <Button variant="ghost" size="sm" onClick={() => syncItem(item)}>
                      Sync now
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default PendingChanges;