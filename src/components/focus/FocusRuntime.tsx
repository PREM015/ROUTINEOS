'use client';

/**
 * FocusRuntime — the single owner of the focus session lifecycle.
 *
 * Mounted once in `(dashboard)/layout.tsx`, which is the whole architectural point.
 * The old design put the timer inside `/focus`, so leaving the page unmounted the
 * component that owned the clock: the floating bar froze at `00:00` and its
 * Pause/Resume/Stop buttons became no-ops, because they were closures over
 * `setState` of a component React had already thrown away.
 *
 * In the layout, the runtime outlives every navigation. Nothing that controls a
 * session is unmountable while the user is signed in.
 *
 * ## What it owns
 *
 * - The absolute deadline, and one `setTimeout` armed against it. Not an interval:
 *   a timeout that fires once is exactly the right primitive for "wake me when
 *   this is over", and it cannot drift or double-fire the way a repeating one can.
 * - The heartbeat sender, gated on visibility so a backgrounded tab stays quiet.
 * - Persistence to a **user-scoped** `localStorage` key, with cross-tab sync.
 * - The retry queue for failed transitions, replayed on `online` and on refocus.
 * - Completion: chime, notification, title, achievement check, auto-start.
 * - Sleep auto-pause, through the existing sleep-session poller.
 *
 * ## What it deliberately does not own
 *
 * Rendering. It returns `null`. Every visible consequence is derived from the
 * store plus `useFocusNow`, which is what lets the dial, the floating bar and the
 * document title all read the same number without coordinating.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { ApiError, apiRequest } from '@/lib/api-client';
import {
  FOCUS_SYNC_EVENT,
  focusStorageKey,
  registerFocusRuntime,
  useFocusStore,
  type FocusSnapshot,
  type ReflectionInput,
} from '@/store/focus.store';
import { notifyFocusDataChanged } from '@/lib/app-events';
import { adoptFromServerRow } from '@/lib/focus/timer-machine';
import type { FocusSessionType } from '@/constants/prisma-enums';
import { useSleepSession } from '@/hooks/useSleepSession';
import { useFocusSettings } from '@/hooks/useFocusSettings';
import { enqueue, loadOutbox, removeFromOutbox } from '@/lib/focus/outbox';
import { DEFAULT_FOCUS_DURATIONS, plannedMsFor } from '@/lib/focus/durations';

/** How often to prove the session is still being watched. */
const HEARTBEAT_MS = 60_000;

/**
 * A transition the server has not acknowledged yet.
 *
 * Held in memory rather than in localStorage on purpose. Replaying a stale
 * `pause` from a previous session on the next login would pause a session the
 * user never paused; the server is authoritative and will simply ignore transitions
 * for a session that has already ended, so the cost of dropping the queue on
 * reload is one lost retry, while the cost of persisting it is a wrong timer.
 */
interface PendingTransition {
  sessionId: string;
  kind: 'pause' | 'resume' | 'end';
  endReason?: 'COMPLETED' | 'STOPPED' | 'SKIPPED' | 'MODE_SWITCHED';
  at: number;
  /**
   * IndexedDB key of the durable copy, once one exists.
   *
   * Absent means the transition is only in memory - either IndexedDB was unavailable,
   * or the write failed. The drain treats those differently: it removes the row only
   * when there is one, so an in-memory-only transition is still delivered and simply
   * leaves nothing behind to clean up.
   */
  localId?: number;
}

interface PendingOptions {
  sessionId?: string;
  endReason?: PendingTransition['endReason'];
}

interface PersistedFocusState {
  sessionId: string | null;
  mode: FocusSnapshot['mode'];
  status: FocusSnapshot['status'];
  startedAt: number | null;
  endsAt: number | null;
  pausedAt: number | null;
  pausedTotalMs: number;
  plannedMs: number;
  cycles: number;
  runId: string | null;
  cycleIndex: number | null;
}

interface ActiveSessionResponse {
  id: string;
  type: FocusSessionType;
  startedAt: string;
  pausedAt: string | null;
  pausedTotalSeconds: number;
  plannedDuration: number;
  title: string | null;
  categoryId: string | null;
  needsRecovery?: boolean;
  recovery?: {
    recommended: 'credit-evidence' | 'credit-full' | 'discard';
    options: string[];
    evidenceMs: number;
    fullMs: number;
    reason: string;
  } | null;
}

// =============================================================================
// Sound
//
// Synthesised with Web Audio: no asset, no dependency, no network request. The
// AudioContext is created lazily and resumed on a user gesture, because browsers
// refuse to start it otherwise — which is the usual reason a "chime" silently
// does nothing on a timer that was started by a click.
// =============================================================================

let audioContext: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

/**
 * A short three-note chime.
 *
 * Rising, and quiet. A focus tool that startles you has defeated its own purpose,
 * so the gain ceiling is low and the whole thing is under a second.
 */
function playChime(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    [0, 0.18, 0.4].forEach((delay, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = [660, 880, 990][index] ?? 880;
      const at = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.24);
    });
  } catch {
    // Autoplay policy or missing hardware must never break the timer.
  }
}

/** True when the browser will let us make noise at all. */
export function audioBlocked(): boolean {
  if (typeof window === 'undefined') return false;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return !Ctor || audioContext?.state === 'suspended';
}

// =============================================================================
// Persistence
//
// Read defensively and clamp. This is untrusted input: localStorage survives
// across app versions, a user's tampering, and a browser that half-restored a
// profile. A malformed payload must produce a clean idle timer, never a NaN
// countdown and never a thrown render.
// =============================================================================

function clampMs(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readPersisted(key: string): Partial<PersistedFocusState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const status = record.status;
    if (status !== 'running' && status !== 'paused' && status !== 'finished' && status !== 'idle') {
      return null;
    }
    return {
      sessionId: typeof record.sessionId === 'string' ? record.sessionId : null,
      mode:
        record.mode === 'short-break' || record.mode === 'long-break' || record.mode === 'stopwatch'
          ? record.mode
          : 'focus',
      status,
      startedAt: typeof record.startedAt === 'number' ? record.startedAt : null,
      endsAt: typeof record.endsAt === 'number' ? record.endsAt : null,
      pausedAt: typeof record.pausedAt === 'number' ? record.pausedAt : null,
      pausedTotalMs: clampMs(record.pausedTotalMs, 0),
      /*
       * `clampMs`'s second argument is the fallback used when a persisted field is
       * missing or corrupt. It reads the same constant the store's initial state does,
       * so a restore with no usable `plannedMs` lands on the same number as a first
       * paint rather than on a second, separately-chosen default.
       */
      plannedMs: clampMs(record.plannedMs, DEFAULT_FOCUS_DURATIONS.focusMinutes * 60_000),
      cycles: clampMs(record.cycles, 0),
      runId: typeof record.runId === 'string' ? record.runId : null,
      cycleIndex: typeof record.cycleIndex === 'number' ? record.cycleIndex : null,
    };
  } catch {
    return null;
  }
}

function writePersisted(key: string, state: FocusSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    if (state.status === 'idle') {
      window.localStorage.removeItem(key);
      return;
    }
    const payload: PersistedFocusState = {
      sessionId: state.sessionId,
      mode: state.mode,
      status: state.status,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      pausedAt: state.pausedAt,
      pausedTotalMs: state.pausedTotalMs,
      plannedMs: state.plannedMs,
      cycles: state.cycles,
      runId: state.runId,
      cycleIndex: state.cycleIndex,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Private mode or quota. The server row is the real record.
  }
}

// =============================================================================
// The runtime
// =============================================================================

export function FocusRuntime() {
  /**
   * Field-by-field selectors, never `useFocusStore()` wholesale.
   *
   * Two reasons. The `exhaustive-deps` rule is right to complain when a callback
   * closes over the whole store object — it re-creates on every store change,
   * including changes to `error` and `collapsed` that have nothing to do with the
   * timer. And a single whole-store subscription is precisely the pattern that
   * produced the old floating bar's thirteen re-rendering selectors: every
   * consumer re-rendered on every tick of a value most of them never read.
   */
  const sessionId = useFocusStore((s) => s.sessionId);
  const mode = useFocusStore((s) => s.mode);
  const status = useFocusStore((s) => s.status);
  const startedAt = useFocusStore((s) => s.startedAt);
  const endsAt = useFocusStore((s) => s.endsAt);
  const pausedAt = useFocusStore((s) => s.pausedAt);
  const pausedTotalMs = useFocusStore((s) => s.pausedTotalMs);
  const plannedMs = useFocusStore((s) => s.plannedMs);
  const cycles = useFocusStore((s) => s.cycles);
  const runId = useFocusStore((s) => s.runId);
  const cycleIndex = useFocusStore((s) => s.cycleIndex);

  const { state: sleepState } = useSleepSession();
  const { data: authSession } = useSession();
  const { settings: focusSettings } = useFocusSettings();

  /*
   * Adopt the configured timebox, but only while idle.
   *
   * The guard is the whole point. `plannedMs` is an input to the deadline arithmetic
   * (`endsAt = startedAt + plannedMs + pausedTotalMs`), so rewriting it on a live
   * session would silently move a deadline the user is currently watching, and on
   * load that race is guaranteed - settings resolve after the persisted snapshot is
   * restored. So a running or paused session keeps the length it was started with, and
   * the new value applies to the next one.
   */
  useEffect(() => {
    if (status !== 'idle') return;
    const next = plannedMsFor(mode, focusSettings);
    if (next === null) return;
    const store = useFocusStore.getState();
    if (store.plannedMs === next) return;
    useFocusStore.getState().adopt({ plannedMs: next });
  }, [focusSettings.focusMinutes, focusSettings.shortBreakMinutes, focusSettings.longBreakMinutes, mode, status]);

  /**
   * A minimal projection of the store, rebuilt only when one of the persisted
   * fields actually changes. Everything that needs to write uses `getState()`
   * instead, so no callback depends on this object.
   */
  const snapshot = useMemo<PersistedFocusState>(
    () => ({
      sessionId,
      mode,
      status,
      startedAt,
      endsAt,
      pausedAt,
      pausedTotalMs,
      plannedMs,
      cycles,
      runId,
      cycleIndex,
    }),
    [
      sessionId,
      mode,
      status,
      startedAt,
      endsAt,
      pausedAt,
      pausedTotalMs,
      plannedMs,
      cycles,
      runId,
      cycleIndex,
    ]
  );

  const timeoutRef = useRef<number | null>(null);
  const queueRef = useRef<PendingTransition[]>([]);

  /**
   * User-scoped persistence key.
   *
   * Scoped by id on purpose. The old keys were global, so on a shared browser the
   * next person to sign in inherited the previous person's running timer — and the
   * audit flags exactly this as a risk. `anonymous` is a real fallback for the
   * pre-auth first paint, and the server read that follows corrects it.
   */
  const storageKey = useMemo(
    () => focusStorageKey(authSession?.user?.id),
    [authSession?.user?.id]
  );

  /** Replay queued transitions, oldest first. */
  const drainQueue = useCallback(async () => {
    const pending = queueRef.current;
    if (pending.length === 0) return;
    // Cleared before the awaits so a transition that fails mid-drain is re-queued
    // by its own catch rather than being lost when the array is overwritten.
    queueRef.current = [];
    for (const item of pending) {
      try {
        await apiRequest(`/api/focus/${item.sessionId}/${item.kind}`, {
          method: 'POST',
          body: item.kind === 'end' ? { endReason: item.endReason } : {},
        });
        // Only drop the durable copy once the server has actually accepted it.
        if (item.localId !== undefined) await removeFromOutbox(item.localId);
      } catch {
        queueRef.current.push(item);
      }
    }
  }, []);

  /** Publish a transition so a second tab follows along. */
  const broadcast = useCallback((next: Partial<PersistedFocusState>) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(FOCUS_SYNC_EVENT, { detail: next }));
  }, []);

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  /**
   * Send a transition, queueing it on failure.
   *
   * A failed transition is never dropped silently — that is the difference between
   * "your session was lost" and "your session is still running and the app is
   * telling you it cannot reach the server right now". The queue replays on
   * `online` and on refocus.
   */
  /**
   * Self-reference for the Retry affordance.
   *
   * A `useCallback` cannot call itself: the closure would capture the binding
   * before its declaration, which is a temporal-dead-zone read the compiler
   * correctly refuses (and which is genuinely wrong — a stale copy would be
   * retained forever). The ref gives the Retry button a stable handle to the
   * current implementation without the cycle.
   */
  const transitionRef = useRef<
    (kind: PendingTransition['kind'], options?: PendingOptions) => Promise<boolean>
  >(() => Promise.resolve(false));

  const transition = useCallback(
    async (
      kind: PendingTransition['kind'],
      options: PendingOptions = {}
    ): Promise<boolean> => {
      const target = options.sessionId ?? useFocusStore.getState().sessionId;
      if (!target) return false;

      const store = useFocusStore.getState();
      store.setBusy(true);
      try {
        if (kind === 'end') {
          await apiRequest(`/api/focus/${target}/end`, {
            method: 'POST',
            body: { endReason: options.endReason ?? 'STOPPED' },
          });
        } else {
          await apiRequest(`/api/focus/${target}/${kind}`, { method: 'POST', body: {} });
        }

        // Drain anything that queued behind this one.
        const pending = queueRef.current.filter((item) => item.sessionId === target);
        queueRef.current = queueRef.current.filter((item) => item.sessionId !== target);
        for (const item of pending) {
          await apiRequest(`/api/focus/${item.sessionId}/${item.kind}`, {
            method: 'POST',
            body: item.kind === 'end' ? { endReason: item.endReason } : {},
          })
            .then(() => {
              if (item.localId !== undefined) void removeFromOutbox(item.localId);
            })
            .catch(() => {
              queueRef.current.push(item);
            });
        }

        store.setError(null);
        return true;
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : 'Could not reach the server.';
        // Queued rather than dropped: a session whose `pause` never landed would
        // keep billing paused time as focus time, and a lost `end` would leave a
        // row that looks live forever.
        //
        // Also written to IndexedDB. The in-memory copy only survives a network blip;
        // closing the tab mid-session - the most likely way to lose an `end` - used to
        // drop it, and a lost `end` is precisely the stale-running-row problem the
        // server's own recovery has to clean up afterwards.
        const queued: PendingTransition = {
          sessionId: target,
          kind,
          endReason: options.endReason,
          at: Date.now(),
        };
        queueRef.current.push(queued);
        void enqueue({
          sessionId: target,
          kind,
          endReason: options.endReason,
        }).catch(() => {
          // Storage unavailable. `queued` is already in memory, so this degrades to
          // the old behaviour rather than losing the transition.
        });
        store.setError(message);
        toast.error(message, {
          description: 'Your session is still running. We will retry when you reconnect.',
          action: {
            label: 'Retry',
            onClick: () => void transitionRef.current(kind, options),
          },
        });
        return false;
      } finally {
        store.setBusy(false);
      }
    },
    []
  );

  // Kept in an effect rather than assigned during render: a ref written while
  // rendering is invisible to React's dependency tracking, so the value could
  // change without anything re-rendering to notice.
  useEffect(() => {
    transitionRef.current = transition;
  }, [transition]);

  const refresh = useCallback(async () => {
    try {
      const row = await apiRequest<ActiveSessionResponse | null>('/api/focus/active');
      if (!row) {
        useFocusStore.getState().reset();
        return;
      }
      const next = adoptFromServerRow(row, Date.now());
      useFocusStore.getState().adopt({
        sessionId: row.id,
        mode: next.mode,
        status: next.status,
        startedAt: next.startedAt,
        endsAt: next.endsAt,
        pausedAt: next.pausedAt,
        pausedTotalMs: next.pausedTotalMs,
        plannedMs: next.plannedMs,
        intent: row.title ?? '',
        categoryId: row.categoryId ?? null,
        runId: next.sessionId ? useFocusStore.getState().runId : null,
      });
    } catch {
      // Offline. The local projection stays authoritative for display; it is a
      // cache, and the server will be re-read on the next focus or reconnect.
    }
  }, []);

const start = useCallback(async () => {
    const store = useFocusStore.getState();
    store.setBusy(true);
    try {
      const clientId = crypto.randomUUID();
      const row = await apiRequest<ActiveSessionResponse>('/api/focus/start', {
        method: 'POST',
        body: {
          type: store.mode,
          plannedSeconds: store.plannedMs > 0 ? Math.round(store.plannedMs / 1000) : null,
          title: store.intent.trim() || undefined,
          categoryId: store.categoryId,
          taskId: store.taskId,
          goalId: store.goalId,
          habitId: store.habitId,
          routineBlockId: store.routineBlockId,
          runId: store.runId,
          cycleIndex: store.cycleIndex,
          clientId,
        },
      });
      const now = Date.now();
      store.adopt({
        sessionId: row.id,
        status: 'running',
        startedAt: now,
        endsAt: store.plannedMs > 0 ? now + store.plannedMs : null,
        pausedAt: null,
        pausedTotalMs: 0,
        error: null,
      });
      store.setError(null);
      requestNotificationPermission();
      notifyFocusDataChanged();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not start the session.';
      store.setError(message);
      toast.error(message);
    } finally {
      store.setBusy(false);
    }
  }, []);

const pause = useCallback(
    async (reason?: string) => {
      const store = useFocusStore.getState();
      if (store.status !== 'running') return;
      store.adopt({ status: 'paused', pausedAt: Date.now(), endsAt: store.endsAt });
      await transition('pause');
      if (reason) {
        void apiRequest(`/api/focus/${store.sessionId}/events`, {
          method: 'POST',
          body: { type: 'NOTE', label: reason },
        }).catch(() => undefined);
      }
      notifyFocusDataChanged();
    },
    [transition]
  );

const resume = useCallback(async () => {
    const store = useFocusStore.getState();
    if (store.status !== 'paused') return;
    const now = Date.now();
    const span = Math.max(0, now - (store.pausedAt ?? now));
    store.adopt({
      status: 'running',
      pausedAt: null,
      pausedTotalMs: store.pausedTotalMs + span,
      // Push the deadline out by exactly the span consumed, so the countdown
      // resumes where it stopped instead of losing that time.
      endsAt: store.plannedMs > 0 ? (store.endsAt ?? now) + span : null,
    });
    await transition('resume');
    notifyFocusDataChanged();
  }, [transition]);

const stop = useCallback(
    async (endReason: 'STOPPED' | 'SKIPPED' | 'MODE_SWITCHED') => {
      const store = useFocusStore.getState();
      if (store.sessionId) await transition('end', { endReason });
      store.reset();
      notifyFocusDataChanged();
    },
    [transition]
  );

const reset = useCallback(async () => {
    await stop('STOPPED');
    notifyFocusDataChanged();
  }, [stop]);

  const extend = useCallback(
    async (seconds = 300) => {
      const store = useFocusStore.getState();
      await apiRequest(`/api/focus/${store.sessionId}/extend`, {
        method: 'POST',
        body: { seconds },
      }).catch(() => undefined);
      const now = Date.now();
      store.adopt({
        endsAt: store.plannedMs > 0 ? (store.endsAt ?? now) + seconds * 1000 : null,
      });
      notifyFocusDataChanged();
    },
    []
  );

  const logDistraction = useCallback(async (label?: string) => {
    const store = useFocusStore.getState();
    await apiRequest(`/api/focus/${store.sessionId}/events`, {
      method: 'POST',
      body: { type: 'DISTRACTION', label },
    }).catch(() => undefined);
  }, []);

  const saveNote = useCallback(async (note: string) => {
    const store = useFocusStore.getState();
    await apiRequest(`/api/focus/${store.sessionId}/events`, {
      method: 'POST',
      body: { type: 'NOTE', note },
    }).catch(() => undefined);
  }, []);

  const reflect = useCallback(async (input: ReflectionInput) => {
    const store = useFocusStore.getState();
    if (!store.sessionId) return;
    await apiRequest(`/api/focus/${store.sessionId}`, {
      method: 'PATCH',
      body: input,
    }).catch(() => undefined);
  }, []);

  // ---------------------------------------------------------------------------
  // Completion
  // ---------------------------------------------------------------------------

  /**
   * Run everything a finished session owes the user, in a deliberate order.
   *
   * Sound first (it is the only cue that works when the tab is hidden and the
   * notification is suppressed), then the notification, then the title, then the
   * achievement check, and only then the auto-start — which is a state change, and
   * doing it earlier would unmount whatever is about to play the celebration.
   */
  const complete = useCallback(async () => {
    const store = useFocusStore.getState();
    const finishedMode = store.mode;

    playChime();

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      showNotification('Focus complete', 'Nice work.');
    }

    document.title = 'Focus complete — RoutineOS';

    // Fire and forget: an achievement check failing must never block the timer.
    void import('@/store/achievement.store')
      .then((m) => m.runAchievementCheck())
      .catch(() => undefined);

const cycles = finishedMode === 'focus' ? store.cycles + 1 : store.cycles;
    store.adopt({ status: 'finished', startedAt: null, endsAt: null, pausedAt: null, cycles });
    notifyFocusDataChanged();
  }, []);

  // ---------------------------------------------------------------------------
  // Effects: deadline, heartbeat, persistence, cross-tab, visibility
  // ---------------------------------------------------------------------------

  // One timeout against the absolute deadline. Re-armed whenever the deadline
  // changes, and disarmed on anything that makes it not-yet.
  useEffect(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (status !== 'running' || endsAt === null) return;

    const delay = endsAt - Date.now();
    if (delay <= 0) {
      void complete();
      return;
    }
    // `2^31-1` ms is the largest delay a browser accepts; a longer timebox is
    // armed in chunks rather than silently firing immediately, which is the
    // classic symptom of an overflowed setTimeout.
    const capped = Math.min(delay, 2_147_483_647);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      void complete();
    }, capped);
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [status, endsAt, complete]);

  // Heartbeat: evidence of presence, and only while visible.
  useEffect(() => {
    if (status !== 'running' || !sessionId) return;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      void apiRequest(`/api/focus/${sessionId}/heartbeat`, { method: 'POST' }).catch(() => undefined);
    };
    const id = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [status, sessionId]);

  // Persist to the user-scoped cache, and tell other tabs.
  useEffect(() => {
    if (snapshot.status === 'idle') {
      writePersisted(storageKey, { ...snapshot, status: 'idle' } as FocusSnapshot);
    } else {
      writePersisted(storageKey, snapshot as unknown as FocusSnapshot);
    }
    if (!snapshot.sessionId) return;
    broadcast(snapshot);
  }, [storageKey, broadcast, snapshot]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<Partial<PersistedFocusState>>).detail;
      if (!detail) return;
      const store = useFocusStore.getState();
      // Another tab is authoritative about the *server* row, but not about the
      // dial's presentation. Adopt only if it is a live session; otherwise this
      // tab would clear a session another tab is in the middle of ending.
      if (detail.sessionId && detail.status && detail.status !== 'idle') {
        store.adopt(detail as Partial<FocusSnapshot>);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as PersistedFocusState;
        if (next.sessionId && next.status !== 'idle') {
          useFocusStore.getState().adopt(next as unknown as Partial<FocusSnapshot>);
        }
      } catch {
        // A malformed payload from another tab is ignored, not fatal.
      }
    };
    window.addEventListener(FOCUS_SYNC_EVENT, onSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(FOCUS_SYNC_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [storageKey]);

// Re-read the server whenever the tab comes back, and replay anything queued.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    /*
     * Restore the durable queue *before* registering the drain triggers, and drain once
     * on mount.
     *
     * Order matters: if `online`/`visibilitychange` fired before the restore resolved,
     * the drain would run against an empty `queueRef`, see nothing to do, and return -
     * leaving the restored items sitting unsent until the next focus change. Loading
     * first means the very first drain sees them.
     *
     * The mount drain is what closes the gap this whole module exists for: a tab closed
     * mid-session and reopened now finishes delivering its `end`.
     */
    let restored = false;
    void loadOutbox().then((rows) => {
      if (rows.length === 0) return;
      for (const row of rows) {
        queueRef.current.push({
          sessionId: row.sessionId,
          kind: row.kind,
          endReason: row.endReason as PendingTransition['endReason'],
          at: Date.parse(row.queuedAt),
          localId: row.localId,
        });
      }
      restored = true;
      void drainQueue();
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
      void drainQueue();
    };
    const onOnline = () => {
      void drainQueue();
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      // `restored` is read only to document that the restore is fire-and-forget; the
      // cleanup below must not cancel it, because a cancelled restore would silently
      // discard queued transitions on unmount.
      void restored;
    };
  }, [refresh, drainQueue]);

  useEffect(() => {
    if (!sessionId) return;
    broadcast(snapshot);
  }, [broadcast, sessionId, snapshot]);

  // ---------------------------------------------------------------------------
  // Sleep auto-pause
  // ---------------------------------------------------------------------------

  const sleepActive = Boolean(sleepState?.active);
  const prevSleepRef = useRef(false);
  useEffect(() => {
    const was = prevSleepRef.current;
    prevSleepRef.current = sleepActive;
    if (!sleepActive || was) return;
    if (useFocusStore.getState().status !== 'running') return;
    void pause('sleep');
    toast('Paused: sleep session started.', {
      description: 'Resume when you are back at your desk.',
      action: { label: 'Resume', onClick: () => void resume() },
    });
  }, [sleepActive, pause, resume]);

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Restore from cache immediately so the dial renders on the first frame with a
    // plausible number rather than flashing "00:00" while the server read lands.
    const persisted = readPersisted(storageKey);
    if (persisted && (persisted.status === 'running' || persisted.status === 'paused')) {
      useFocusStore.getState().adopt(persisted as Partial<FocusSnapshot>);
    }
    void refresh();

    return registerFocusRuntime({
      start,
      pause,
      resume,
      reset,
      stop,
      extend,
      logDistraction,
      saveNote,
      refresh,
      reflect,
    });
  }, [storageKey, refresh, start, pause, resume, reset, stop, extend, logDistraction, saveNote, reflect]);

  return null;
}

/** Ask for notification permission. Must be called from a user gesture. */
function requestNotificationPermission(): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // Unsupported. The chime and the title still fire.
  }
}

function showNotification(title: string, body: string): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // Never let a notification break the timer.
  }
}

export default FocusRuntime;
