import { STORE_OUTBOX, idbGetAll, idbPutAll } from '@/lib/offline/idb';

/**
 * Captures user input while offline and replays it on reconnect.
 *
 * ## Why not the existing `queue.ts`
 *
 * `src/lib/offline/queue.ts` queues into `localStorage`, which a service worker
 * cannot read — so its companion `sync` handler could never flush anything — and
 * `queueAction` had **zero call sites**, so the queue was always empty. The
 * offline banner's "changes will be synced when you reconnect" was a promise
 * nothing honoured.
 *
 * This module uses IndexedDB (shared with `public/sw.js`) so the queued writes
 * survive a tab close and the worker can replay them itself.
 *
 * ## Idempotency
 *
 * Offline replay is inherently **at-least-once**: a request that landed but whose
 * response was lost is indistinguishable from one that never landed, so the
 * queue retries it. Sleep and habit writes are not naturally idempotent — a
 * replayed habit log would double-count.
 *
 * Every queued item therefore carries a client-generated `idempotencyKey`, sent
 * as `X-Idempotency-Key`. Deduplication still has to be enforced server-side; the
 * key makes that possible without changing response shapes.
 */

export interface QueuedAction {
  url: string;
  method?: string;
  body?: unknown;
  /** Stable across retries of the same logical action. */
  idempotencyKey: string;
  /** Local creation time, for display and for dropping hopeless entries. */
  queuedAt: number;
  /** Short label so the UI can say what is pending. */
  label?: string;
}

interface StoredAction extends QueuedAction {
  localId?: number;
}

function makeKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Queue one mutation for later delivery.
 *
 * Best-effort and never throws: failing to queue must not lose the user's
 * action outright, so callers should fall back to their normal request when this
 * resolves false.
 */
export async function enqueueAction(
  action: Omit<QueuedAction, 'idempotencyKey' | 'queuedAt'> & { idempotencyKey?: string }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const record: QueuedAction = {
    url: action.url,
    method: action.method ?? 'POST',
    body: action.body,
    idempotencyKey: action.idempotencyKey ?? makeKey(),
    queuedAt: Date.now(),
    label: action.label,
  };

  try {
    await idbPutAll(STORE_OUTBOX, [record]);
  } catch {
    return false;
  }

  // Tell the worker so it can arm Background Sync and take over replay if this
  // tab goes away.
  //
  // The message is deliberately NOT `OUTBOX_PUSH`. That handler calls
  // `putAll(STORE_OUTBOX, …)` again, and because the record posted here has no
  // `localId` (it is assigned by the store's `autoIncrement` on the write above),
  // the worker's second `put` allocated a *new* key. One queued action therefore
  // became two rows, both were flushed, and the user saw the pending count
  // double. The page has already persisted it; the worker only needs to arm
  // Background Sync, so that is all it is asked to do.
  try {
    const registration = await navigator.serviceWorker?.ready;
    const target = registration?.active ?? navigator.serviceWorker?.controller;
    target?.postMessage({ type: 'ARM_SYNC' });
  } catch {
    // No worker (or not yet active) — the `online` listener still flushes.
  }

  return true;
}

export async function pendingCount(): Promise<number> {
  const items = await idbGetAll<StoredAction>(STORE_OUTBOX).catch(() => []);
  return items.length;
}

export async function pendingActions(): Promise<StoredAction[]> {
  const items = await idbGetAll<StoredAction>(STORE_OUTBOX).catch(() => []);
  return items.sort((a, b) => a.queuedAt - b.queuedAt);
}

export interface FlushResult {
  synced: number;
  dropped: number;
  remaining: number;
}

/**
 * Replay everything queued, oldest first.
 *
 * Stops at the first network/server failure rather than continuing, so the
 * queue preserves causal order — reordering a habit log against the sleep log
 * would produce worse data than a delay.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const items = await pendingActions();
  let synced = 0;
  let dropped = 0;

  for (const item of items) {
    if (item.localId === undefined) continue;

    try {
      const response = await fetch(item.url, {
        method: item.method ?? 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey,
        },
        body: JSON.stringify(item.body ?? {}),
      });

      if (response.ok) {
        await deleteQueued(item.localId);
        synced += 1;
        continue;
      }

      // A 4xx (other than the two "come back later" codes) will never succeed,
      // so keep it out of the queue rather than wedging everything behind it.
      const retriable = response.status >= 500 || response.status === 408 || response.status === 429;
      if (!retriable) {
        await deleteQueued(item.localId);
        dropped += 1;
        continue;
      }
      break;
    } catch {
      // Still offline.
      break;
    }
  }

  return { synced, dropped, remaining: await pendingCount() };
}

async function deleteQueued(localId: number): Promise<void> {
  const { idbDelete } = await import('@/lib/offline/idb');
  await idbDelete(STORE_OUTBOX, localId).catch(() => undefined);
}

/**
 * Flush whenever the browser reports connectivity.
 *
 * `navigator.onLine` only means "has a network interface", not "the server is
 * reachable" (captive portals are the classic trap), so a failure here is not
 * treated as fatal — the queue simply stays and the next event retries.
 */
export function attachOnlineFlush(onFlushed?: (result: FlushResult) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handler = () => {
    void flushOutbox().then((result) => {
      if (result.synced > 0 || result.dropped > 0) onFlushed?.(result);
    });
  };

  window.addEventListener('online', handler);
  // A tab restored from the background may have come back online without an event.
  if (isOnline()) handler();

  return () => window.removeEventListener('online', handler);
}

/**
 * Send now if possible, otherwise queue.
 *
 * The single entry point mutation code should use. Note the ordering: when
 * offline the action is queued and the caller is told it succeeded *locally*,
 * so the UI can reflect the user's input immediately — the data is not lost, and
 * a rejected request never surfaces as a scary error for something that will
 * land later.
 */
export async function submitOrQueue(
  action: Omit<QueuedAction, 'idempotencyKey' | 'queuedAt'>
): Promise<{ delivered: boolean; queued: boolean }> {
  if (isOnline()) {
    try {
      const response = await fetch(action.url, {
        method: action.method ?? 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.body ?? {}),
      });
      if (response.ok) return { delivered: true, queued: false };
      // A validation error is the user's problem to fix, not something to retry
      // later, so surface it rather than silently deferring.
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        return { delivered: false, queued: false };
      }
    } catch {
      // fall through to the queue
    }
  }

  const queued = await enqueueAction(action);
  return { delivered: false, queued };
}
