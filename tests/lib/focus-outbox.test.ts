import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * The outbox module talks to IndexedDB, which is not available in the `node` test
 * environment this project runs. Rather than pull in a fake-indexeddb dependency - the
 * standing constraint is no new packages - the module is exercised through a stub of
 * `@/lib/offline/idb` and the pure rules are asserted directly.
 */

const put = vi.fn(async () => undefined);
const del = vi.fn(async () => undefined);
const getAll = vi.fn(async () => [] as unknown[]);
const clear = vi.fn(async () => undefined);

vi.mock('@/lib/offline/idb', () => ({
  STORE_OUTBOX: 'outbox',
  idbPut: put,
  idbDelete: del,
  idbGetAll: getAll,
  idbClear: clear,
}));

/** Minimal IndexedDB stand-in so `idbAvailable()` is true. */
beforeEach(() => {
  put.mockClear();
  del.mockClear();
  clear.mockClear();
  getAll.mockReset();
  getAll.mockResolvedValue([]);
  vi.stubGlobal('indexedDB', {});
  vi.stubGlobal('window', {});
});

describe('focus outbox', () => {
  it('stamps queuedAt and starts attempts at zero', async () => {
    const { enqueue } = await import('@/lib/focus/outbox');
    await enqueue({ sessionId: 's1', kind: 'end', endReason: 'COMPLETED' });

    expect(put).toHaveBeenCalledTimes(1);
    const [store, value] = put.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(store).toBe('outbox');
    expect(value.sessionId).toBe('s1');
    expect(value.kind).toBe('end');
    expect(value.attempts).toBe(0);
    expect(Number.isFinite(Date.parse(String(value.queuedAt)))).toBe(true);
  });

  it('orders the restored queue oldest first, regardless of key order', async () => {
    // Auto-increment keys are assigned per store and can interleave across tabs; the
    // timestamp is the ordering we actually mean.
    getAll.mockResolvedValue([
      { localId: 1, sessionId: 's3', kind: 'end', queuedAt: '2026-10-04T12:00:00.000Z', attempts: 0 },
      { localId: 2, sessionId: 's1', kind: 'pause', queuedAt: '2026-10-04T10:00:00.000Z', attempts: 1 },
      { localId: 3, sessionId: 's2', kind: 'resume', queuedAt: '2026-10-04T11:00:00.000Z', attempts: 0 },
    ]);

    const { loadOutbox } = await import('@/lib/focus/outbox');
    const rows = await loadOutbox();

    expect(rows.map((r) => r.sessionId)).toEqual(['s1', 's2', 's3']);
  });

  it('drops and deletes an item older than the max age', async () => {
    // A three-day-old pause replayed on reconnect would pause a session that has since
    // closed. Focus is real-time; a stale transition is noise, not work.
    getAll.mockResolvedValue([
      { localId: 7, sessionId: 'old', kind: 'pause', queuedAt: '2020-01-01T00:00:00.000Z', attempts: 3 },
      { localId: 8, sessionId: 'new', kind: 'end', queuedAt: new Date().toISOString(), attempts: 0 },
    ]);

    const { loadOutbox, OUTBOX_MAX_AGE_MS } = await import('@/lib/focus/outbox');
    const rows = await loadOutbox();

    expect(rows.map((r) => r.sessionId)).toEqual(['new']);
    expect(del).toHaveBeenCalledWith('outbox', 7);
    expect(OUTBOX_MAX_AGE_MS).toBeGreaterThan(0);
  });

  it('drops an item with an unparseable timestamp rather than keeping it', async () => {
    getAll.mockResolvedValue([
      { localId: 9, sessionId: 'broken', kind: 'end', queuedAt: 'not-a-date', attempts: 0 },
    ]);

    const { loadOutbox } = await import('@/lib/focus/outbox');
    expect(await loadOutbox()).toEqual([]);
    expect(del).toHaveBeenCalledWith('outbox', 9);
  });

  it('degrades to a no-op when IndexedDB is unavailable', async () => {
    // Private browsing, or a server render. The in-memory queue still holds the
    // transition, so this is a degradation rather than a loss - but it must not throw.
    vi.stubGlobal('indexedDB', undefined);
    const { enqueue, loadOutbox, removeFromOutbox, clearOutbox } = await import(
      '@/lib/focus/outbox'
    );

    await expect(enqueue({ sessionId: 's1', kind: 'pause' })).resolves.toBeUndefined();
    await expect(loadOutbox()).resolves.toEqual([]);
    await expect(removeFromOutbox(1)).resolves.toBeUndefined();
    await expect(clearOutbox()).resolves.toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  it('survives a storage failure without throwing', async () => {
    put.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const { enqueue } = await import('@/lib/focus/outbox');
    await expect(enqueue({ sessionId: 's1', kind: 'pause' })).resolves.toBeUndefined();
  });
});