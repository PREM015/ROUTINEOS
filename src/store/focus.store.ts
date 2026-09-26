/**
 * Focus zustand store — a global, page-independent snapshot of the running
 * focus timer.
 *
 * <FocusTimer/> (the full timer UI) owns the actual timing logic and pushes
 * a lightweight snapshot here whenever status/mode/end-time changes. The
 * floating bar subscribes to this store so a running pomodoro is visible and
 * controllable from any dashboard page — never duplicated, always in sync.
 *
 * Actions are delegated back into the mounted <FocusTimer/> via `controls`:
 * the timer registers pause/resume/stop callbacks on mount.
 */

'use client';

import { create } from 'zustand';

export type FocusMode = 'focus' | 'short-break' | 'long-break' | 'stopwatch';
export type FocusStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface FocusSnapshot {
  status: FocusStatus;
  mode: FocusMode;
  /** Absolute deadline (ms epoch) for countdown modes. */
  endsAt: number | null;
  /** Milliseconds left — meaningful for countdown modes (esp. paused). */
  remainingMs: number;
  plannedMs: number;
  /** Accumulated stopwatch time (ms). */
  swAccumMs: number;
  /** Epoch ms the stopwatch segment started (null when not running). */
  swRunStart: number | null;
  /** Completed pomodoro cycles in the current attempt chain. */
  cycles: number;
}

interface FocusControls {
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

interface FocusStoreState extends FocusSnapshot {
  controls: FocusControls;
  collapsed: boolean;
  sync: (snap: FocusSnapshot) => void;
  setControls: (controls: FocusControls) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  toggleCollapsed: () => void;
}

const NOOP_CONTROLS: FocusControls = {
  pause: () => undefined,
  resume: () => undefined,
  stop: () => undefined,
};

export const useFocusStore = create<FocusStoreState>()((set, get) => ({
  status: 'idle',
  mode: 'focus',
  endsAt: null,
  remainingMs: 0,
  plannedMs: 0,
  swAccumMs: 0,
  swRunStart: null,
  cycles: 0,
  controls: NOOP_CONTROLS,
  collapsed: false,

  sync: (snap) => set(snap),

  setControls: (controls) => set({ controls }),

  pause: () => get().controls.pause(),

  resume: () => get().controls.resume(),

  stop: () => get().controls.stop(),

  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
}));