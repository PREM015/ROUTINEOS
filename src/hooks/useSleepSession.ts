'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSleepSession
 * Shared client state for the v2 sleep tracking experience. Polls `/api/sleep/session`
 * every 15s (plus on tab focus/visibility), which lazily resolves prompts server-side.
 * Exposes start / stop / respond actions and flags long-running sessions (>16h) so the
 * UI can require a confirmation before stopping.
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

export function useSleepSession() {
  const [state, setState] = useState<SleepStateView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<SleepSessionAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<SleepStateView | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/sleep/session', { credentials: 'include' });
      const json: unknown = await res.json().catch(() => null);
      if (
        json &&
        typeof json === 'object' &&
        (json as { success?: unknown }).success === true
      ) {
        setState((json as { data: SleepStateView }).data);
        setError(null);
      }
    } catch {
      // keep the last known state; the next poll retries
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const run = useCallback(
    async (
      action: SleepSessionAction,
      path: string,
      body?: {
        promptId: string;
        answer: 'YES' | 'NOT_YET';
      }
    ): Promise<boolean> => {
      setBusy(action);
      setError(null);
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
          setError(
            json &&
              typeof json === 'object' &&
              typeof (json as { error?: unknown }).error === 'string'
              ? (json as { error: string }).error
              : 'Something went wrong.'
          );
        }
        await refresh();
        return Boolean(ok);
      } catch {
        setError('Network error. Please try again.');
        return false;
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  const start = useCallback(() => run('start', '/api/sleep/session/start'), [run]);
  const stop = useCallback(() => run('stop', '/api/sleep/session/stop'), [run]);
  const respond = useCallback(
    (answer: 'YES' | 'NOT_YET') => {
      const prompt = stateRef.current?.prompt;
      if (!prompt) return Promise.resolve(false);
      return run('respond', '/api/sleep/session/respond', {
        promptId: prompt.id,
        answer,
      });
    },
    [run]
  );

  const activeAt = state?.active?.startedAt
    ? Date.parse(state.active.startedAt)
    : null;
  const longRunning =
    activeAt !== null && Date.now() - activeAt > LONG_SESSION_MS;

  return {
    state,
    loading,
    busy,
    error,
    refresh,
    start,
    stop,
    respond,
    longRunning,
  };
}

export type UseSleepSessionResult = ReturnType<typeof useSleepSession>;