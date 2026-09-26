'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * useSleepSession
 * Shared client state for the v2 sleep tracking experience. Polls `/api/sleep/session`
 * every 15s (plus on tab focus/visibility), which lazily resolves prompts server-side.
 * Exposes start / stop / respond actions and flags long-running sessions (>16h) so the
 * UI can require a confirmation before stopping.
 *
 * The poll loop and the resolved state live in a module-level singleton rather
 * than in the hook body. Several components mount this hook at once
 * (`SleepPromptHost` in the dashboard layout, `TodaySleep` on /today, the
 * /focus page), and per-instance copies of the state drifted apart: a prompt
 * dismissed by one copy stayed visible in another, which then POSTed
 * `/api/sleep/session/respond` for a prompt that no longer existed. One shared
 * poller means every consumer renders from the same snapshot and can only
 * respond to a prompt that is genuinely still pending.
 */

export interface SleepLogView {
  id?: string;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  actualDurationMinutes: number | null;
  quality: number | null;
  feltRested: boolean | null;
}

export interface ActiveSessionView {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  source: string | null;
}

export interface SleepPromptView {
  id: string;
  promptKey: string;
  targetBedtime: string;
  scheduledFor: string;
  autoStartAfterMinutes: number;
  secondsUntilAutoStart: number;
}

export interface SleepStateView {
  timezone: string;
  active: ActiveSessionView | null;
  prompt: SleepPromptView | null;
  todaySleepLog: SleepLogView | null;
}

export type SleepSessionAction = 'start' | 'stop' | 'respond';

const POLL_MS = 15_000;
export const LONG_SESSION_MS = 16 * 60 * 60 * 1000;

interface SharedSleepSessionStore {
  state: SleepStateView | null;
  loading: boolean;
  busy: SleepSessionAction | null;
  error: string | null;
}

let store: SharedSleepSessionStore = {
  state: null,
  loading: true,
  busy: null,
  error: null,
};

const listeners = new Set<() => void>();
let pollTimer: number | null = null;
let refCount = 0;
/** Detaches the focus/visibility listeners installed by `startPolling`. */
let pollCleanup: (() => void) | null = null;
/** Guards against overlapping refreshes from the interval + focus handlers. */
let refreshInflight: Promise<void> | null = null;

function emit(next: Partial<SharedSleepSessionStore>): void {
  store = { ...store, ...next };
  for (const listener of listeners) listener();
}

function getServerSnapshot(): SharedSleepSessionStore {
  return store;
}

async function refresh(): Promise<void> {
  if (refreshInflight) return refreshInflight;

  refreshInflight = (async () => {
    try {
      const res = await fetch('/api/sleep/session', { credentials: 'include' });
      const json: unknown = await res.json().catch(() => null);
      if (
        json &&
        typeof json === 'object' &&
        (json as { success?: unknown }).success === true
      ) {
        emit({ state: (json as { data: SleepStateView }).data, error: null });
      }
    } catch {
      // keep the last known state; the next poll retries
    } finally {
      emit({ loading: false });
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

function startPolling(): void {
  if (pollTimer !== null) return;

  void refresh();
  pollTimer = window.setInterval(() => void refresh(), POLL_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  pollCleanup = () => {
    window.removeEventListener('focus', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  pollCleanup?.();
  pollCleanup = null;
}

/**
 * Runs a sleep-session mutation and re-syncs state afterwards.
 * A resolved prompt is a successful no-op, not an error.
 */
async function run(
  action: SleepSessionAction,
  path: string,
  body?: { promptId: string; answer: 'YES' | 'NOT_YET' }
): Promise<boolean> {
  emit({ busy: action, error: null });
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json: unknown = await res.json().catch(() => null);
    const ok =
      res.ok &&
      json &&
      typeof json === 'object' &&
      (json as { success?: unknown }).success === true;
    if (!ok) {
      emit({
        error:
          json &&
          typeof json === 'object' &&
          typeof (json as { error?: unknown }).error === 'string'
            ? (json as { error: string }).error
            : 'Something went wrong.',
      });
    }
    await refresh();
    return Boolean(ok);
  } catch {
    emit({ error: 'Network error. Please try again.' });
    return false;
  } finally {
    emit({ busy: null });
  }
}

export function useSleepSession() {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, []),
    getServerSnapshot,
    getServerSnapshot
  );

  const stateRef = useRef<SleepStateView | null>(snapshot.state);
  stateRef.current = snapshot.state;

  useEffect(() => {
    refCount += 1;
    if (refCount === 1) startPolling();
    return () => {
      refCount -= 1;
      if (refCount === 0) stopPolling();
    };
  }, []);

  const start = useCallback(() => run('start', '/api/sleep/session/start'), []);
  const stop = useCallback(() => run('stop', '/api/sleep/session/stop'), []);

  /**
   * Answer a pending prompt. No-ops unless a prompt is still pending in the
   * shared snapshot, so a stale render can never fire a request for a prompt
   * that has already been dismissed or auto-started.
   */
  const respond = useCallback((answer: 'YES' | 'NOT_YET') => {
    const prompt = stateRef.current?.prompt;
    if (!prompt) return Promise.resolve(false);
    return run('respond', '/api/sleep/session/respond', {
      promptId: prompt.id,
      answer,
    });
  }, []);

  const activeAt = snapshot.state?.active?.startedAt
    ? Date.parse(snapshot.state.active.startedAt)
    : null;
  const longRunning =
    activeAt !== null && Date.now() - activeAt > LONG_SESSION_MS;

  return {
    state: snapshot.state,
    loading: snapshot.loading,
    busy: snapshot.busy,
    error: snapshot.error,
    refresh,
    start,
    stop,
    respond,
    longRunning,
  };
}

export type UseSleepSessionResult = ReturnType<typeof useSleepSession>;
