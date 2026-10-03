/**
 * Focus store — timestamps only, never a decremented counter.
 *
 * ## Why this shape
 *
 * The previous store mirrored `FocusTimer`'s component state, including a
 * `remainingMs` field that the timer pushed down on every tick. That produced the
 * frozen-bar bug: on unmount the timer cleared its interval but left
 * `{ status: 'running', endsAt }` in the store, so the floating bar kept counting
 * down to `00:00` and stuck there — and its Pause/Resume/Stop buttons called
 * closures over `setState` of an unmounted component, so all three were silent
 * no-ops.
 *
 * The fix is structural rather than defensive. This store holds **no derived
 * time at all**: only absolute instants and a status. Every readout is computed
 * from `Date.now()` at the moment it is rendered. Two consequences:
 *
 *   1. A throttled or backgrounded tab cannot make the displayed time wrong. It
 *      was already wrong in the old design, where the value was whatever the last
 *      tick managed to write before the browser suspended the callback.
 *   2. There is nothing to get stale. "Stale" requires a cached value, and there
 *      isn't one.
 *
 * ## Who owns what
 *
 * The **runtime** (`components/focus/FocusRuntime.tsx`, mounted in the dashboard
 * layout) owns transitions and server calls. This store is a *projection* of that
 * runtime plus the server row — it can be replaced wholesale by `adopt`, which is
 * how a second tab and a reconnect both reconcile.
 *
 * The store deliberately holds **no callbacks**. The old `controls` field held
 * `pause`/`resume`/`stop` closures into a mounted component, which is precisely
 * what made those buttons no-ops after navigation. Callers now invoke the
 * runtime's imperative API (exposed via `getFocusRuntime()`), which lives outside
 * the React tree and therefore cannot be unmounted out from under them.
 */

'use client';

import { create } from 'zustand';
import type { FocusSessionType } from '@/constants/prisma-enums';
import type { FocusMode } from '@/lib/focus/type-backfill';
import { DEFAULT_FOCUS_DURATIONS } from '@/lib/focus/durations';

export type { FocusMode, FocusSessionType };

export type FocusStatus = 'idle' | 'running' | 'paused' | 'finished';

/**
 * The whole client-side model. Every time field is ms-since-epoch.
 *
 * `plannedMs` is the timebox and `pausedTotalMs` the accumulated pause, so the
 * deadline is always `startedAt + plannedMs + pausedTotalMs` — derivable from any
 * subset of a persisted state, which is what makes a partial restore safe.
 */
export interface FocusSnapshot {
  /** Server row id. Null before the first Start and after a Reset. */
  sessionId: string | null;
  mode: FocusMode;
  status: FocusStatus;
  /** Absolute start of the current attempt. */
  startedAt: number | null;
  /** Absolute deadline for a countdown. Null for a stopwatch and while idle. */
  endsAt: number | null;
  /** Absolute instant the current pause began. */
  pausedAt: number | null;
  pausedTotalMs: number;
  /** The timebox. `0` means open-ended (stopwatch). */
  plannedMs: number;
  /** Completed focus blocks in the current run. */
  cycles: number;
  /** What the user is working on; persisted as the session `title`. */
  intent: string;
  categoryId: string | null;
  taskId: string | null;
  goalId: string | null;
  habitId: string | null;
  routineBlockId: string | null;
  /** Groups a chain of sessions so the cycle count survives a reload. */
  runId: string | null;
  cycleIndex: number | null;
  /** Set when a transition failed, so the UI can offer Retry. Never silent. */
  error: string | null;
  /** True while a save is in flight, so buttons can disable themselves. */
  busy: boolean;
  /** Bar collapsed to its pill. Presentation only, so it is not persisted. */
  collapsed: boolean;
}

export const EMPTY_SNAPSHOT: FocusSnapshot = {
  sessionId: null,
  mode: 'focus',
  status: 'idle',
  startedAt: null,
  endsAt: null,
  pausedAt: null,
  pausedTotalMs: 0,
  /*
   * Replaced by the user's `FocusSettings.focusMinutes` as soon as
   * `FocusRuntime` has loaded them. This is the pre-request value so the first paint
   * shows a plausible timebox instead of `0`, and it comes from the same
   * `DEFAULT_FOCUS_DURATIONS` the settings page defaults to rather than a second
   * literal - one number, one definition.
   */
  plannedMs: (DEFAULT_FOCUS_DURATIONS.focusMinutes ?? 25) * 60_000,
  cycles: 0,
  intent: '',
  categoryId: null,
  taskId: null,
  goalId: null,
  habitId: null,
  routineBlockId: null,
  runId: null,
  cycleIndex: null,
  error: null,
  busy: false,
  collapsed: false,
};

interface FocusStoreState extends FocusSnapshot {
  /** Replace the whole projection. Used by the runtime after any server read. */
  adopt: (next: Partial<FocusSnapshot>) => void;
  /** Shallow-merge display fields. For intent/typing, which must not round-trip. */
  patch: (next: Partial<FocusSnapshot>) => void;
  setError: (error: string | null) => void;
  setBusy: (busy: boolean) => void;
  toggleCollapsed: () => void;
  reset: () => void;
}

export const useFocusStore = create<FocusStoreState>()((set) => ({
  ...EMPTY_SNAPSHOT,

  adopt: (next) => set(next),

  patch: (next) => set(next),

  setError: (error) => set({ error }),

  setBusy: (busy) => set({ busy }),

  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),

  // `collapsed` is presentation state, not session state, so it survives a reset.
  reset: () => set((state) => ({ ...EMPTY_SNAPSHOT, collapsed: state.collapsed })),
}));

/** True when a session is in flight, for anything that only cares "is it live". */
export function isLive(status: FocusStatus): boolean {
  return status === 'running' || status === 'paused';
}

/**
 * Read a snapshot outside React.
 *
 * Used by the document-title updater and the completion timeout, both of which
 * run outside the render tree and would otherwise have to subscribe.
 */
export function focusState(): FocusStoreState {
  return useFocusStore.getState();
}

// -----------------------------------------------------------------------------
// The imperative runtime API.
//
// Module-level rather than React context, for one specific reason: the floating
// bar's buttons must keep working after the user navigates away from `/focus`.
// A context provider re-renders with the tree that mounted it, and a mounted
// component's closures die with it — which is exactly the bug this replaces. A
// module-level singleton survives every navigation, and `FocusRuntime` registers
// its implementations on mount.
// -----------------------------------------------------------------------------

export interface FocusRuntimeApi {
  start: () => Promise<void>;
  pause: (reason?: string) => Promise<void>;
  resume: () => Promise<void>;
  reset: () => Promise<void>;
  stop: (endReason: 'STOPPED' | 'SKIPPED' | 'MODE_SWITCHED') => Promise<void>;
  extend: (seconds?: number) => Promise<void>;
  logDistraction: (label?: string) => Promise<void>;
  saveNote: (note: string) => Promise<void>;
  /** Re-read `/api/focus/active` and adopt it. */
  refresh: () => Promise<void>;
  /** Submit an end-of-session reflection. */
  reflect: (input: ReflectionInput) => Promise<void>;
}

export interface ReflectionInput {
  focusRating?: number;
  energyAfter?: number;
  notes?: string;
  distractions?: string[];
}

let runtimeApi: FocusRuntimeApi | null = null;

/**
 * Register the runtime's implementations.
 *
 * Returns an unregister function so React 18 StrictMode's mount/unmount/mount
 * cycle in development cannot leave a stale API pointing at an unmounted
 * runtime — the identical failure mode as the original bug, one level down.
 */
export function registerFocusRuntime(api: FocusRuntimeApi): () => void {
  runtimeApi = api;
  return () => {
    if (runtimeApi === api) runtimeApi = null;
  };
}

/**
 * The runtime API, or `null` before the runtime mounts.
 *
 * Callers must handle `null` by falling back to navigating to `/focus`, because
 * "no runtime yet" is a real state (first paint, and any page outside the
 * dashboard group) rather than an error.
 */
export function getFocusRuntime(): FocusRuntimeApi | null {
  return runtimeApi;
}

/**
 * User-scoped persistence key.
 *
 * Scoped by user id on purpose. The keys used to be global, so on a shared browser
 * the next person to sign in inherited the previous person's running timer — and
 * the audit's §15.3 flags exactly this as a risk to close.
 */
export function focusStorageKey(userId: string | undefined): string {
  return `routineos:focus:v2:${userId ?? 'anonymous'}`;
}

/** Cross-tab event name. Namespaced to focus so it cannot collide. */
export const FOCUS_SYNC_EVENT = 'routineos:focus-sync';
