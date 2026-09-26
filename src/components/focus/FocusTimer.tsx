'use client';

/**
 * FocusTimer — timestamp-based focus timer (spec P1-7).
 *
 * Timing model (root-cause fix for drift):
 * - Countdown modes store `endsAt = Date.now() + remainingMs` and recompute
 *   `remaining = endsAt - Date.now()` on every tick. The counter is never
 *   decremented, so throttled intervals or background tabs cannot skew it.
 * - The stopwatch stores `runStartedAt` + `accumulatedMs` and derives
 *   `elapsed = accumulated + (now - runStartedAt)` from the clock.
 * - Exactly one `setInterval` exists (the tick effect, keyed on
 *   status/mode) with cleanup, so StrictMode mount/unmount cycles are safe.
 * - `{ mode, endsAt/remainingMs, cycles }` persist to localStorage; a refresh
 *   resumes running/paused attempts, including stopwatch accumulation.
 *
 * Sessions are POSTed to /api/focus with the timer payload shape
 * `{ type, plannedSeconds, actualSeconds, startedAt, endedAt, completed }`,
 * which the Zod schema accepts natively. History is fetched exactly once
 * (`GET /api/focus?limit=100`, single useEffect + AbortController).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Coffee,
  Flag,
  History,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Timer as TimerIcon,
  Hourglass,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFocusStore } from '@/store/focus.store';
import { runAchievementCheck } from '@/store/achievement.store';

export type TimerMode = 'focus' | 'short-break' | 'long-break' | 'stopwatch';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface FocusTimerProps {
  workMinutes?: number;
  shortBreak?: number;
  longBreak?: number;
  cyclesBeforeLongBreak?: number;
  soundEnabled?: boolean;
  autoStartBreak?: boolean;
  autoStartFocus?: boolean;
  onComplete?: (completedWorkCycles: number) => void;
  onPhaseChange?: (phase: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK') => void;
  className?: string;
  /** When true (a sleep session is running), a running timer is paused. */
  sleepActive?: boolean;
}

interface FocusDurations {
  focus: number;
  shortBreak: number;
  longBreak: number;
}

interface FocusSettings {
  durations: FocusDurations;
  cyclesBeforeLongBreak: number;
  autoStartBreak: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
}

interface PersistedTimer {
  mode: TimerMode;
  status: 'running' | 'paused';
  endsAt: number | null;
  remainingMs: number;
  plannedMs: number;
  swAccumMs: number;
  swRunStart: number | null;
  attemptStartedAt: number | null;
  cycles: number;
}

interface Lap {
  id: number;
  n: number;
  lapMs: number;
  totalMs: number;
}

interface HistoryItem {
  id: string;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  startedAt: string;
  completed: boolean;
}

interface FocusSessionRow {
  id: string;
  title: string;
  plannedDuration: number;
  actualDuration: number | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
}

const TIMER_STORAGE_KEY = 'routineos:focus-timer:v1';
const SETTINGS_STORAGE_KEY = 'routineos:focus-settings:v1';
const PRESETS = [5, 10, 15, 20, 25, 30, 45, 60] as const;
const MIN_CUSTOM_MINUTES = 1;
const MAX_CUSTOM_MINUTES = 180;
const MAX_SECONDS = 180 * 60;
const MIN_STOP_SECONDS = 1;

const DEFAULT_SETTINGS: FocusSettings = {
  durations: { focus: 25, shortBreak: 5, longBreak: 15 },
  cyclesBeforeLongBreak: 4,
  autoStartBreak: false,
  autoStartFocus: false,
  soundEnabled: true,
};

const MODE_META: Record<TimerMode, { label: string; color: string; icon: LucideIcon }> = {
  focus: { label: 'Focus', color: '#3b82f6', icon: TimerIcon },
  'short-break': { label: 'Short break', color: '#22c55e', icon: Coffee },
  'long-break': { label: 'Long break', color: '#8b5cf6', icon: Flag },
  stopwatch: { label: 'Stopwatch', color: '#f59e0b', icon: Hourglass },
};

const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function durationMsFor(mode: TimerMode, settings: FocusSettings): number {
  if (mode === 'focus') return settings.durations.focus * 60000;
  if (mode === 'short-break') return settings.durations.shortBreak * 60000;
  if (mode === 'long-break') return settings.durations.longBreak * 60000;
  return 0;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatStopwatch(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const centiseconds = Math.floor((clamped % 1000) / 10);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function formatLap(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const cs = Math.floor((Math.max(0, ms) % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function requestNotificationPermission(): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      // User gesture only: this is called from the Start button handler.
      void Notification.requestPermission();
    }
  } catch {
    // Notifications unavailable; the timer works without them.
  }
}

function sendNotification(title: string, body: string): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // Never let notifications break the timer.
  }
}

/** WebAudio finish beep — synthesized, no asset files. */
function playFinishSound(): void {
  try {
    if (typeof window === 'undefined') return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    [0, 0.28, 0.56].forEach((delay, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = index === 2 ? 660 : 880;
      const at = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.26);
    });
  } catch {
    // Autoplay policies or missing hardware must never break the timer.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readSettings(props: FocusTimerProps): FocusSettings {
  if (typeof window === 'undefined') return withProps(DEFAULT_SETTINGS, props);
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return withProps(DEFAULT_SETTINGS, props);
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return withProps(DEFAULT_SETTINGS, props);
    const durations = isRecord(parsed.durations) ? parsed.durations : {};
    return {
      durations: {
        focus: clampInt(Number(durations.focus ?? DEFAULT_SETTINGS.durations.focus), 1, 180),
        shortBreak: clampInt(Number(durations.shortBreak ?? DEFAULT_SETTINGS.durations.shortBreak), 1, 180),
        longBreak: clampInt(Number(durations.longBreak ?? DEFAULT_SETTINGS.durations.longBreak), 1, 180),
      },
      cyclesBeforeLongBreak: clampInt(Number(parsed.cyclesBeforeLongBreak ?? 4), 1, 12),
      autoStartBreak: parsed.autoStartBreak === true,
      autoStartFocus: parsed.autoStartFocus === true,
      soundEnabled: parsed.soundEnabled !== false,
    };
  } catch {
    return withProps(DEFAULT_SETTINGS, props);
  }
}

function withProps(base: FocusSettings, props: FocusTimerProps): FocusSettings {
  return {
    durations: {
      focus: props.workMinutes !== undefined ? clampInt(props.workMinutes, 1, 180) : base.durations.focus,
      shortBreak: props.shortBreak !== undefined ? clampInt(props.shortBreak, 1, 180) : base.durations.shortBreak,
      longBreak: props.longBreak !== undefined ? clampInt(props.longBreak, 1, 180) : base.durations.longBreak,
    },
    cyclesBeforeLongBreak:
      props.cyclesBeforeLongBreak !== undefined
        ? clampInt(props.cyclesBeforeLongBreak, 1, 12)
        : base.cyclesBeforeLongBreak,
    autoStartBreak: props.autoStartBreak ?? base.autoStartBreak,
    autoStartFocus: props.autoStartFocus ?? base.autoStartFocus,
    soundEnabled: props.soundEnabled ?? base.soundEnabled,
  };
}

function mapRowToHistory(row: FocusSessionRow): HistoryItem {
  const planned = Number.isFinite(row.plannedDuration) ? row.plannedDuration : 0;
  const actual = row.actualDuration ?? planned;
  return {
    id: row.id,
    title: row.title || 'Focus session',
    plannedMinutes: planned,
    actualMinutes: actual,
    startedAt: row.startedAt,
    completed: row.completedAt !== null || row.status === 'COMPLETED',
  };
}

export function FocusTimer(props: FocusTimerProps) {
  const { onComplete, onPhaseChange, className } = props;

  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<FocusSettings>(() => DEFAULT_SETTINGS);
  const [mode, setMode] = useState<TimerMode>('focus');
  const [status, setStatus] = useState<TimerStatus>('idle');
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(() => DEFAULT_SETTINGS.durations.focus * 60000);
  const [plannedMs, setPlannedMs] = useState(() => DEFAULT_SETTINGS.durations.focus * 60000);
  const [swAccumMs, setSwAccumMs] = useState(0);
  const [swRunStart, setSwRunStart] = useState<number | null>(null);
  const [swElapsedMs, setSwElapsedMs] = useState(0);
  const [attemptStartedAt, setAttemptStartedAt] = useState<number | null>(null);
  const [cycles, setCycles] = useState(0);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const endsAtRef = useRef<number | null>(null);
  const swRunStartRef = useRef<number | null>(null);
  const swAccumRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const statusRef = useRef<TimerStatus>('idle');
  const postedRef = useRef(false);
  const lapSeqRef = useRef(1);
  const restoreDoneRef = useRef(false);
  const pauseRef = useRef<() => void>(() => {});
  const finishRef = useRef<() => void>(() => {});
  const startRef = useRef<() => void>(() => {});
  const stopResetRef = useRef<() => void>(() => {});
  const postSessionRef = useRef<(args: {
    type: TimerMode;
    plannedSeconds: number;
    actualSeconds: number;
    startedAt: number | null;
    completed: boolean;
  }) => Promise<void>>(() => Promise.resolve());

  const isCountdown = mode !== 'stopwatch';
  const displayText = isCountdown ? formatCountdown(remainingMs) : formatStopwatch(swElapsedMs);

  // ---- Session POST -------------------------------------------------------
  const postSession = useCallback(
    async (args: {
      type: TimerMode;
      plannedSeconds: number;
      actualSeconds: number;
      startedAt: number | null;
      completed: boolean;
    }): Promise<void> => {
      const plannedSeconds = clampInt(args.plannedSeconds, 1, MAX_SECONDS);
      const actualSeconds = clampInt(args.actualSeconds, 0, MAX_SECONDS);
      const startedAt = new Date(args.startedAt ?? Date.now());
      const body = {
        type: args.type,
        plannedSeconds,
        actualSeconds,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        completed: args.completed,
      };
      let response: Response;
      try {
        response = await fetch('/api/focus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save the session.');
        return;
      }
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          isRecord(json) && typeof json.error === 'string'
            ? json.error
            : `Could not save the session (status ${response.status}).`;
        setSaveError(message);
        return;
      }
      setSaveError(null);
      const data: unknown = isRecord(json) ? json.data : null;
      const titleByType: Record<TimerMode, string> = {
        focus: 'Focus session',
        'short-break': 'Short break',
        'long-break': 'Long break',
        stopwatch: 'Stopwatch session',
      };
      if (isRecord(data) && typeof data.id === 'string') {
        const item: HistoryItem = {
          id: data.id,
          title: typeof data.title === 'string' ? data.title : titleByType[args.type],
          plannedMinutes: Math.max(1, Math.round(plannedSeconds / 60)),
          actualMinutes: Math.max(0, Math.round(actualSeconds / 60)),
          startedAt: startedAt.toISOString(),
          completed: args.completed,
        };
        setHistory((prev) => (prev === null ? [item] : [item, ...prev].slice(0, 100)));
      }
    },
    []
  );
// eslint-disable-next-line react-hooks/refs -- latest-ref pattern: kept in sync outside render so callbacks read the newest values
  postSessionRef.current = postSession;

  // Keep mutable refs in sync outside render (interval callbacks read them).
  useEffect(() => {
    onCompleteRef.current = onComplete;
    statusRef.current = status;
  postSessionRef.current = postSession;
  }, [onComplete, status, postSession]);

  // ---- Restore persisted timer + settings (mount only) --------------------
  useEffect(() => {
    if (restoreDoneRef.current) return;
    restoreDoneRef.current = true;

    const nextSettings = readSettings(props);
    setSettings(nextSettings);

    try {
      const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)) {
          const savedMode: TimerMode =
            parsed.mode === 'short-break' || parsed.mode === 'long-break' || parsed.mode === 'stopwatch'
              ? parsed.mode
              : 'focus';
          const savedCycles = clampInt(Number(parsed.cycles ?? 0), 0, 1000);
          // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration on mount
          setMode(savedMode);
          setCycles(savedCycles);

          if (savedMode === 'stopwatch') {
            const accum = Number(parsed.swAccumMs ?? 0);
            const runStart = typeof parsed.swRunStart === 'number' ? parsed.swRunStart : null;
            const attempt = typeof parsed.attemptStartedAt === 'number' ? parsed.attemptStartedAt : null;
            const safeAccum = Number.isFinite(accum) ? Math.max(0, accum) : 0;
            if (parsed.status === 'running' && runStart !== null) {
              // Timestamp-based resume: the run start is absolute, so time
              // spent with the tab closed still counts.
              swRunStartRef.current = runStart;
              swAccumRef.current = safeAccum;
              setSwAccumMs(safeAccum);
              setSwRunStart(runStart);
              setSwElapsedMs(safeAccum + Math.max(0, Date.now() - runStart));
              setAttemptStartedAt(attempt);
              setStatus('running');
            } else if (parsed.status === 'paused') {
              swAccumRef.current = safeAccum;
              setSwAccumMs(safeAccum);
              setSwElapsedMs(safeAccum);
              setAttemptStartedAt(attempt);
              setStatus('paused');
            }
          } else {
            const planned = durationMsFor(savedMode, nextSettings);
            const savedEndsAt = typeof parsed.endsAt === 'number' ? parsed.endsAt : null;
            const savedRemaining = Number(parsed.remainingMs ?? planned);
            const safeRemaining = Number.isFinite(savedRemaining)
              ? Math.min(planned, Math.max(0, savedRemaining))
              : planned;
            const attempt = typeof parsed.attemptStartedAt === 'number' ? parsed.attemptStartedAt : null;
            setPlannedMs(planned);
            if (parsed.status === 'running' && savedEndsAt !== null) {
              const live = savedEndsAt - Date.now();
              if (live > 0) {
                endsAtRef.current = savedEndsAt;
                setEndsAt(savedEndsAt);
                setRemainingMs(live);
                setAttemptStartedAt(attempt);
                setStatus('running');
              } else {
                // The countdown expired while away: record it as completed
                // once instead of silently dropping the session.
                setRemainingMs(0);
                setAttemptStartedAt(null);
                setStatus('finished');
                postedRef.current = true;
                if (savedMode === 'focus') {
                  const nextCycles = savedCycles + 1;
                  setCycles(nextCycles);
                  onCompleteRef.current?.(nextCycles);
                }
                void postSessionRef.current({
                  type: savedMode,
                  plannedSeconds: Math.max(MIN_STOP_SECONDS, Math.round(planned / 1000)),
                  actualSeconds: Math.max(MIN_STOP_SECONDS, Math.round(planned / 1000)),
                  startedAt: attempt,
                  completed: true,
                });
              }
            } else if (parsed.status === 'paused') {
              setRemainingMs(safeRemaining);
              setAttemptStartedAt(attempt);
              setStatus('paused');
            } else {
              setRemainingMs(planned);
            }
          }
        }
      } else {
        setRemainingMs(nextSettings.durations.focus * 60000);
        setPlannedMs(nextSettings.durations.focus * 60000);
      }
    } catch {
      // Corrupt storage: fall back to idle defaults.
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- History: exactly one fetch, AbortController, limit=100 -------------
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset fetch state before the mount fetch
    setHistoryError(null);
    fetch('/api/focus?limit=100', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const json: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            isRecord(json) && typeof json.error === 'string'
              ? json.error
              : `Could not load history (status ${response.status}).`;
          throw new Error(message);
        }
        const rows: unknown = isRecord(json) ? json.data : null;
        if (!Array.isArray(rows)) return;
        if (controller.signal.aborted) return;
        const items = rows
          .filter((row): row is FocusSessionRow => isRecord(row) && typeof row.id === 'string')
          .map(mapRowToHistory);
        setHistory(items);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setHistoryError(err instanceof Error ? err.message : 'Could not load history.');
        setHistory([]);
      });
    return () => controller.abort();
  }, []);

  // ---- Persist settings ----------------------------------------------------
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Private mode / quota: keep in-memory state.
    }
  }, [settings, hydrated]);

  // ---- Persist running/paused timer ----------------------------------------
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (status === 'running' || status === 'paused') {
        const persisted: PersistedTimer = {
          mode,
          status,
          endsAt,
          remainingMs,
          plannedMs,
          swAccumMs,
          swRunStart,
          attemptStartedAt,
          cycles,
        };
        window.localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(persisted));
      } else {
        window.localStorage.removeItem(TIMER_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
  }, [hydrated, mode, status, endsAt, remainingMs, plannedMs, swAccumMs, swRunStart, attemptStartedAt, cycles]);

  // ---- The single tick interval (timestamp-based) ---------------------------
  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => {
      if (mode === 'stopwatch') {
        const runStart = swRunStartRef.current;
        if (runStart === null) return;
        setSwElapsedMs(swAccumRef.current + Math.max(0, Date.now() - runStart));
        return;
      }
      const ends = endsAtRef.current;
      if (ends === null) return;
      const live = ends - Date.now();
      if (live <= 0) {
        setRemainingMs(0);
        finishRef.current();
      } else {
        setRemainingMs(live);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [status, mode]);

  // ---- document.title while running -----------------------------------------
  useEffect(() => {
    if (status !== 'running') return;
    const previous = document.title;
    document.title = `${displayText} · ${MODE_META[mode].label} — RoutineOS`;
    return () => {
      document.title = previous;
    };
  }, [status, displayText, mode]);

  // ---- Attempt lifecycle -----------------------------------------------------
  const currentElapsedMs = useCallback((): number => {
    if (mode === 'stopwatch') {
      const runStart = swRunStartRef.current;
      if (status === 'running' && runStart !== null) {
        return swAccumRef.current + Math.max(0, Date.now() - runStart);
      }
      return swAccumMs;
    }
    const ends = endsAtRef.current;
    if (status === 'running' && ends !== null) {
      return Math.max(0, plannedMs - Math.max(0, ends - Date.now()));
    }
    return Math.max(0, plannedMs - remainingMs);
  }, [mode, status, plannedMs, remainingMs, swAccumMs]);

  const nextModeAfterFocus = useCallback(
    (completedCycles: number): TimerMode =>
      completedCycles % Math.max(1, settings.cyclesBeforeLongBreak) === 0 ? 'long-break' : 'short-break',
    [settings.cyclesBeforeLongBreak]
  );

  const beginCountdown = useCallback(
    (nextMode: TimerMode, totalMs: number): void => {
      const now = Date.now();
      const ends = now + totalMs;
      endsAtRef.current = ends;
      setMode(nextMode);
      setEndsAt(ends);
      setRemainingMs(totalMs);
      setPlannedMs(totalMs);
      setAttemptStartedAt(now);
      postedRef.current = false;
      setStatus('running');
    },
    []
  );

  const finish = useCallback((): void => {
    if (statusRef.current !== 'running') return;
    if (mode === 'stopwatch') return;
    if (postedRef.current) return;
    postedRef.current = true;

    const finishedMode = mode;
    const finishedPlanned = plannedMs;
    const started = attemptStartedAt;
    const finishedSeconds = Math.max(MIN_STOP_SECONDS, Math.round(finishedPlanned / 1000));

    setRemainingMs(0);
    setEndsAt(null);
    endsAtRef.current = null;
    setAttemptStartedAt(null);

    if (settings.soundEnabled) playFinishSound();

    if (finishedMode === 'focus') {
      const nextCycles = cycles + 1;
      setCycles(nextCycles);
      onComplete?.(nextCycles);
      const next = nextModeAfterFocus(nextCycles);
      sendNotification('Focus complete', `Nice work — starting ${MODE_META[next].label.toLowerCase()} next.`);
      void postSessionRef.current({
        type: finishedMode,
        plannedSeconds: finishedSeconds,
        actualSeconds: finishedSeconds,
        startedAt: started,
        completed: true,
      });
      void runAchievementCheck();
      const nextTotal = durationMsFor(next, settings);
      onPhaseChange?.(next === 'long-break' ? 'LONG_BREAK' : 'SHORT_BREAK');
      if (settings.autoStartBreak) {
        beginCountdown(next, nextTotal);
      } else {
        setMode(next);
        setRemainingMs(nextTotal);
        setPlannedMs(nextTotal);
        setStatus('finished');
      }
      return;
    }

    // A break finished: advance back to focus.
    sendNotification('Break over', 'Time to get back into focus.');
    void postSessionRef.current({
      type: finishedMode,
      plannedSeconds: finishedSeconds,
      actualSeconds: finishedSeconds,
      startedAt: started,
      completed: true,
    });
    const focusTotal = durationMsFor('focus', settings);
    onPhaseChange?.('WORK');
    if (settings.autoStartFocus) {
      beginCountdown('focus', focusTotal);
    } else {
      setMode('focus');
      setRemainingMs(focusTotal);
      setPlannedMs(focusTotal);
      setStatus('finished');
    }
  }, [
    mode,
    plannedMs,
    attemptStartedAt,
    settings,
    cycles,
    onComplete,
    onPhaseChange,
    nextModeAfterFocus,
    beginCountdown,
  ]);
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern: kept in sync outside render so interval callbacks read the newest values
  finishRef.current = finish;

  const start = (): void => {
    requestNotificationPermission();
    setSaveError(null);
    if (mode === 'stopwatch') {
      const now = Date.now();
      swRunStartRef.current = now;
      setSwRunStart(now);
      setAttemptStartedAt((prev) => prev ?? now);
      postedRef.current = false;
      setStatus('running');
      return;
    }
    if (status === 'paused') {
      const now = Date.now();
      const ends = now + Math.max(0, remainingMs);
      endsAtRef.current = ends;
      setEndsAt(ends);
      setStatus('running');
      return;
    }
    const total = status === 'finished' ? remainingMs : durationMsFor(mode, settings);
    beginCountdown(mode, Math.max(1000, total));
  };
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern: delegates floating-bar resume to the live handler
  startRef.current = start;

  const pause = (): void => {
    if (status !== 'running') return;
    const now = Date.now();
    if (mode === 'stopwatch') {
      const runStart = swRunStartRef.current ?? now;
      const nextAccum = swAccumRef.current + Math.max(0, now - runStart);
      swAccumRef.current = nextAccum;
      swRunStartRef.current = null;
      setSwAccumMs(nextAccum);
      setSwRunStart(null);
      setSwElapsedMs(nextAccum);
    } else {
      const ends = endsAtRef.current ?? now;
      setRemainingMs(Math.max(0, ends - now));
    }
    setStatus('paused');
  };
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern: kept in sync outside render so the sleep-auto-pause effect can call it
  pauseRef.current = pause;

  // Auto-pause a running timer when a sleep session becomes active (the
  // server also stops the underlying TimeEntry on sleep start).
  const prevSleepActiveRef = useRef(false);
  useEffect(() => {
    const wasActive = prevSleepActiveRef.current;
    prevSleepActiveRef.current = Boolean(props.sleepActive);
    if (props.sleepActive && !wasActive && status === 'running') {
      pauseRef.current();
    }
  }, [props.sleepActive, status]);

  // ---- Global focus store sync ---------------------------------------------
  const syncTimer = useFocusStore((s) => s.sync);
  const setFocusControls = useFocusStore((s) => s.setControls);

  // Push a lightweight snapshot (timestamp-based, tick-independent) so the
  // floating bar stays in sync without mirroring the 5Hz tick interval.
  useEffect(() => {
    syncTimer({ status, mode, endsAt, remainingMs, plannedMs, swAccumMs, swRunStart, cycles });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- discrete fields only; remainingMs is a derived field the bar recomputes itself
  }, [status, mode, endsAt, plannedMs, swAccumMs, swRunStart, cycles]);

  // Register controls once: floating-bar pause/resume/stop delegate into the
  // mounted timer handlers (refs keep the latest closures).
  useEffect(() => {
    setFocusControls({
      pause: () => pauseRef.current(),
      resume: () => startRef.current(),
      stop: () => stopResetRef.current(),
    });
  }, [setFocusControls]);

  const resetToIdle = useCallback(
    (nextMode: TimerMode): void => {
      endsAtRef.current = null;
      setEndsAt(null);
      setMode(nextMode);
      setAttemptStartedAt(null);
      postedRef.current = false;
      if (nextMode === 'stopwatch') {
        swAccumRef.current = 0;
        swRunStartRef.current = null;
        setSwAccumMs(0);
        setSwRunStart(null);
        setSwElapsedMs(0);
      } else {
        const total = durationMsFor(nextMode, settings);
        setRemainingMs(total);
        setPlannedMs(total);
      }
      setStatus('idle');
    },
    [settings]
  );

  /** Stop the current attempt (records an incomplete session) and reset. */
  const stopAndReset = (): void => {
    if ((status === 'running' || status === 'paused') && !postedRef.current) {
      const elapsed = currentElapsedMs();
      if (elapsed >= 1000) {
        postedRef.current = true;
        const stoppedMode = mode;
        void postSession({
          type: stoppedMode,
          plannedSeconds:
            stoppedMode === 'stopwatch'
              ? Math.max(MIN_STOP_SECONDS, Math.round(elapsed / 1000))
              : Math.max(MIN_STOP_SECONDS, Math.round(plannedMs / 1000)),
          actualSeconds: Math.round(elapsed / 1000),
          startedAt: attemptStartedAt,
          completed: false,
        });
      }
    }
    resetToIdle(mode);
  };
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern: delegates floating-bar stop to the live handler
  stopResetRef.current = stopAndReset;

  /** Skip the current countdown session and advance to the next mode. */
  const skip = (): void => {
    if (mode === 'stopwatch') return;
    if ((status === 'running' || status === 'paused') && !postedRef.current) {
      const elapsed = currentElapsedMs();
      if (elapsed >= 1000) {
        postedRef.current = true;
        void postSession({
          type: mode,
          plannedSeconds: Math.max(MIN_STOP_SECONDS, Math.round(plannedMs / 1000)),
          actualSeconds: Math.round(elapsed / 1000),
          startedAt: attemptStartedAt,
          completed: false,
        });
      }
    }
    const next: TimerMode = mode === 'focus' ? nextModeAfterFocus(Math.max(0, cycles)) : 'focus';
    // Skipping a focus session does not increment the cycle counter.
    resetToIdle(next);
  };

  const switchMode = (next: TimerMode): void => {
    if (next === mode) return;
    if ((status === 'running' || status === 'paused') && !postedRef.current) {
      const elapsed = currentElapsedMs();
      if (elapsed >= 1000) {
        postedRef.current = true;
        const stoppedMode = mode;
        void postSession({
          type: stoppedMode,
          plannedSeconds:
            stoppedMode === 'stopwatch'
              ? Math.max(MIN_STOP_SECONDS, Math.round(elapsed / 1000))
              : Math.max(MIN_STOP_SECONDS, Math.round(plannedMs / 1000)),
          actualSeconds: Math.round(elapsed / 1000),
          startedAt: attemptStartedAt,
          completed: false,
        });
      }
    }
    if (mode === 'stopwatch') setLaps([]);
    setSaveError(null);
    resetToIdle(next);
  };

  // ---- Durations ---------------------------------------------------------------
  const applyDuration = (minutes: number): void => {
    if (mode === 'stopwatch') return;
    const key: keyof FocusDurations =
      mode === 'focus' ? 'focus' : mode === 'short-break' ? 'shortBreak' : 'longBreak';
    setSettings((prev) => ({
      ...prev,
      durations: { ...prev.durations, [key]: minutes },
    }));
    // Applied immediately when idle; otherwise takes effect next session.
    if (status === 'idle' || status === 'finished') {
      const total = minutes * 60000;
      setRemainingMs(total);
      setPlannedMs(total);
    }
    setCustomError(null);
  };

  const applyCustom = (): void => {
    const parsed = Number(customInput);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      setCustomError('Enter a whole number of minutes.');
      return;
    }
    if (parsed < MIN_CUSTOM_MINUTES || parsed > MAX_CUSTOM_MINUTES) {
      setCustomError(`Choose between ${MIN_CUSTOM_MINUTES} and ${MAX_CUSTOM_MINUTES} minutes.`);
      return;
    }
    applyDuration(parsed);
  };

  const currentDurationMinutes =
    mode === 'focus'
      ? settings.durations.focus
      : mode === 'short-break'
        ? settings.durations.shortBreak
        : settings.durations.longBreak;

  // ---- Stopwatch laps ------------------------------------------------------------
  const recordLap = (): void => {
    if (mode !== 'stopwatch' || status !== 'running') return;
    const runStart = swRunStartRef.current;
    if (runStart === null) return;
    const total = swAccumRef.current + Math.max(0, Date.now() - runStart);
    setLaps((prev) => {
      const newest = prev[0];
      const prevTotal = newest ? newest.totalMs : 0;
      const prevN = newest ? newest.n : 0;
      const lap: Lap = {
        id: lapSeqRef.current,
        n: prevN + 1,
        lapMs: Math.max(0, total - prevTotal),
        totalMs: total,
      };
      lapSeqRef.current += 1;
      return [lap, ...prev];
    });
  };

  const lapExtremes = useMemo(() => {
    if (laps.length < 2) return { bestId: null as number | null, worstId: null as number | null };
    let best = laps[0];
    let worst = laps[0];
    for (const lap of laps) {
      if (best === undefined || lap.lapMs < best.lapMs) best = lap;
      if (worst === undefined || lap.lapMs > worst.lapMs) worst = lap;
    }
    if (best === undefined || worst === undefined || best.id === worst.id) {
      return { bestId: null as number | null, worstId: null as number | null };
    }
    return { bestId: best.id, worstId: worst.id };
  }, [laps]);

  // ---- History derived -------------------------------------------------------------
  const todayMinutes = useMemo(() => {
    if (!history) return 0;
    const today = localDayKey(new Date());
    return history.reduce((sum, item) => {
      const started = new Date(item.startedAt);
      if (Number.isNaN(started.getTime())) return sum;
      if (localDayKey(started) !== today) return sum;
      return sum + Math.max(0, item.actualMinutes);
    }, 0);
  }, [history]);

  const progress = isCountdown
    ? plannedMs > 0
      ? Math.min(1, Math.max(0, 1 - remainingMs / plannedMs))
      : 0
    : (swElapsedMs % 60000) / 60000;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const meta = MODE_META[mode];

  const statusLabel =
    status === 'running' ? meta.label : status === 'paused' ? 'Paused' : status === 'finished' ? 'Done' : 'Ready';

  if (!hydrated) {
    return (
      <div className={cn('flex flex-col items-center gap-6', className)} aria-busy="true" aria-label="Loading timer">
        <Skeleton className="h-9 w-64 rounded-full" />
        <Skeleton className="h-60 w-60 rounded-full" />
        <div className="flex gap-3">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    );
  }

  const startLabel =
    status === 'paused'
      ? 'Resume'
      : status === 'finished'
        ? isCountdown
          ? `Start ${meta.label}`
          : 'Start'
        : 'Start';

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Timer card */}
        <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-soft lg:col-span-3">
          {/* Mode tabs */}
          <div role="tablist" aria-label="Timer mode" className="flex flex-wrap items-center justify-center gap-2">
            {(Object.keys(MODE_META) as TimerMode[]).map((tab) => {
              const TabIcon = MODE_META[tab].icon;
              const active = tab === mode;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchMode(tab)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    active
                      ? 'border-transparent text-white'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  )}
                  style={active ? { backgroundColor: MODE_META[tab].color } : undefined}
                >
                  <TabIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {MODE_META[tab].label}
                </button>
              );
            })}
          </div>

          {/* Dial */}
          <div className="mt-6 flex flex-col items-center gap-6" role="tabpanel" aria-label={`${meta.label} timer`}>
            <div className="relative flex items-center justify-center" aria-live="polite">
              <svg
                width="280"
                height="280"
                viewBox="0 0 280 280"
                role="img"
                aria-label={`${meta.label} timer, ${displayText} remaining`}
                className={cn(
                  "h-64 w-64 sm:h-72 sm:w-72 transition-transform duration-500 ease-out",
                  status === "running" && "scale-[1.02]"
                )}
              >
                <defs>
                  <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={meta.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={meta.color} stopOpacity="0.6" />
                  </linearGradient>
                </defs>

                <circle
                  cx="140"
                  cy="140"
                  r="128"
                  fill="none"
                  strokeWidth="2"
                  strokeDasharray="4 8"
                  className={cn(
                    "stroke-muted-foreground/20 transition-all duration-1000",
                    status === "running" && "stroke-muted-foreground/40"
                  )}
                  style={{
                    transformOrigin: "140px 140px",
                    animation: status === "running" ? "spin 120s linear infinite" : "none"
                  }}
                />

                <circle
                  cx="140"
                  cy="140"
                  r={RING_RADIUS}
                  fill="none"
                  strokeWidth="16"
                  className="stroke-muted-foreground/10"
                />

                {Array.from({ length: 60 }).map((_, i) => {
                  const angle = (i * 6 * Math.PI) / 180 - Math.PI / 2;
                  const innerR = 76;
                  const outerR = i % 5 === 0 ? 84 : 80;
                  const x1 = 140 + innerR * Math.cos(angle);
                  const y1 = 140 + innerR * Math.sin(angle);
                  const x2 = 140 + outerR * Math.cos(angle);
                  const y2 = 140 + outerR * Math.sin(angle);
                  const isPassed = progress > i / 60;
                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      strokeWidth={i % 5 === 0 ? 2 : 1}
                      className="transition-colors duration-300"
                      stroke={isPassed && status === "running" ? meta.color : "currentColor"}
                      opacity={isPassed && status === "running" ? 0.8 : 0.15}
                    />
                  );
                })}

                <circle
                  cx="140"
                  cy="140"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="url(#ring-gradient)"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 140 140)"
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                  filter="url(#neon-glow)"
                />
              </svg>
              <div className="absolute flex max-w-full flex-col items-center px-6 text-center">
                <span
                  className="font-mono font-bold tabular-nums text-foreground"
                  style={{ fontSize: isCountdown ? '2.75rem' : '1.6rem' }}
                  aria-label={displayText}
                >
                  {displayText}
                </span>
                <span className="mt-1 text-xs font-medium uppercase tracking-wide" style={{ color: meta.color }}>
                  {statusLabel}
                </span>
                {cycles > 0 && (
                  <span className="mt-1 text-xs text-muted-foreground">
                    {cycles} {cycles === 1 ? 'pomodoro' : 'pomodoros'} completed
                  </span>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {(status === 'idle' || status === 'finished') && (
                <Button onClick={start} aria-label={status === 'finished' ? `Start ${meta.label} timer` : 'Start timer'}>
                  <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  {startLabel}
                </Button>
              )}
              {status === 'running' && (
                <Button onClick={pause} aria-label="Pause timer">
                  <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
                  Pause
                </Button>
              )}
              {status === 'paused' && (
                <Button onClick={start} aria-label="Resume timer">
                  <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                  Resume
                </Button>
              )}
              <Button variant="outline" onClick={stopAndReset} aria-label="Reset timer" disabled={status === 'idle'}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Reset
              </Button>
              {isCountdown && (
                <Button
                  variant="outline"
                  onClick={skip}
                  aria-label="Skip to next session"
                  disabled={status === 'idle'}
                >
                  <SkipForward className="mr-2 h-4 w-4" aria-hidden="true" />
                  Skip
                </Button>
              )}
              {mode === 'stopwatch' && (
                <Button
                  variant="outline"
                  onClick={recordLap}
                  aria-label="Record lap"
                  disabled={status !== 'running'}
                >
                  <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
                  Lap
                </Button>
              )}
            </div>

            {saveError && (
              <p role="alert" className="rounded-lg rounded-lg text-sm toast-error px-4 py-2">
                {saveError}
              </p>
            )}

            {/* Duration presets (countdown modes) */}
            {isCountdown && (
              <div className="w-full glass-panel shadow-soft rounded-xl p-4">
                <p id="focus-presets-label" className="text-sm font-medium text-foreground">
                  Duration for {meta.label.toLowerCase()} · {currentDurationMinutes} min
                  {(status === 'running' || status === 'paused') && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (applies to the next session)
                    </span>
                  )}
                </p>
                <div aria-labelledby="focus-presets-label" className="mt-3 flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyDuration(preset)}
                      aria-pressed={currentDurationMinutes === preset}
                      aria-label={`Set duration to ${preset} minutes`}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        currentDurationMinutes === preset
                          ? 'border-transparent text-white'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      )}
                      style={currentDurationMinutes === preset ? { backgroundColor: meta.color } : undefined}
                    >
                      {preset}m
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Input
                      id="focus-custom-minutes"
                      type="number"
                      min={MIN_CUSTOM_MINUTES}
                      max={MAX_CUSTOM_MINUTES}
                      label="Custom minutes (1–180)"
                      placeholder="e.g. 50"
                      value={customInput}
                      error={customError ?? undefined}
                      onChange={(event) => {
                        setCustomInput(event.target.value);
                        setCustomError(null);
                      }}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={applyCustom} aria-label="Apply custom duration">
                    Apply
                  </Button>
                </div>
              </div>
            )}

            {/* Stopwatch laps */}
            {mode === 'stopwatch' && (
              <div className="w-full glass-panel shadow-soft rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">
                    Laps {laps.length > 0 && <span className="text-muted-foreground">({laps.length})</span>}
                  </h3>
                  {laps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setLaps([])}
                      aria-label="Clear laps"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Clear
                    </button>
                  )}
                </div>
                {laps.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No laps yet — press Lap while the stopwatch is running.
                  </p>
                ) : (
                  <ol className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1" aria-label="Lap times, newest first">
                    {laps.map((lap) => (
                      <li
                        key={lap.id}
                        className={cn(
                          'flex items-center justify-between rounded-lg border px-3 py-1.5 font-mono text-sm tabular-nums',
                          lap.id === lapExtremes.bestId &&
                            'border-primary/30 bg-primary/10 text-primary',
                          lap.id === lapExtremes.worstId &&
                            'border-destructive/30 bg-destructive/10 text-destructive',
                          lap.id !== lapExtremes.bestId &&
                            lap.id !== lapExtremes.worstId &&
                            'border-border text-foreground'
                        )}
                      >
                        <span>
                          Lap {lap.n}
                          {lap.id === lapExtremes.bestId && (
                            <span className="ml-2 rounded-full bg-emerald-600 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
                              Best
                            </span>
                          )}
                          {lap.id === lapExtremes.worstId && (
                            <span className="ml-2 rounded-full bg-destructive px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white">
                              Slowest
                            </span>
                          )}
                        </span>
                        <span>
                          <span className="mr-3 text-muted-foreground">{formatLap(lap.lapMs)}</span>
                          <span>{formatStopwatch(lap.totalMs)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Settings + today */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-soft">
            <h2 className="text-base font-semibold text-foreground">Session settings</h2>
            <div className="mt-4">
              <Input
                id="focus-cycles"
                type="number"
                min={1}
                max={12}
                label="Sessions before a long break"
                value={settings.cyclesBeforeLongBreak}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    cyclesBeforeLongBreak: clampInt(Number(event.target.value), 1, 12),
                  }))
                }
                helperText={`Default 4 — currently every ${settings.cyclesBeforeLongBreak} focus sessions.`}
              />
            </div>
            <div className="mt-4 space-y-3">
              <Switch
                checked={settings.autoStartBreak}
                onChange={(checked) => setSettings((prev) => ({ ...prev, autoStartBreak: checked }))}
                label="Auto-start break after focus"
              />
              <Switch
                checked={settings.autoStartFocus}
                onChange={(checked) => setSettings((prev) => ({ ...prev, autoStartFocus: checked }))}
                label="Auto-start focus after a break"
              />
              <Switch
                checked={settings.soundEnabled}
                onChange={(checked) => setSettings((prev) => ({ ...prev, soundEnabled: checked }))}
                label="Play sound on finish"
              />
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-soft">
            <h2 className="text-base font-semibold text-foreground">Today</h2>
            {history === null ? (
              <div className="mt-3 space-y-2" aria-busy="true" aria-label="Loading today's total">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            ) : (
              <>
                <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-foreground">
                  {todayMinutes}
                  <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">min</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {history.length} {history.length === 1 ? 'session' : 'sessions'} in the last 100 records
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Session history</h2>
        </div>
        {history === null && !historyError ? (
          <div className="mt-4 space-y-2" aria-busy="true" aria-label="Loading session history">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : historyError ? (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" role="alert">
            <p>{historyError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setHistory(null);
                setHistoryError(null);
                fetch('/api/focus?limit=100', { credentials: 'include' })
                  .then(async (response) => {
                    const json: unknown = await response.json().catch(() => null);
                    if (!response.ok) {
                      const message =
                        isRecord(json) && typeof json.error === 'string'
                          ? json.error
                          : `Could not load history (status ${response.status}).`;
                      throw new Error(message);
                    }
                    const rows: unknown = isRecord(json) ? json.data : null;
                    if (!Array.isArray(rows)) {
                      setHistory([]);
                      return;
                    }
                    setHistory(
                      rows
                        .filter((row): row is FocusSessionRow => isRecord(row) && typeof row.id === 'string')
                        .map(mapRowToHistory)
                    );
                  })
                  .catch((err: unknown) => {
                    setHistoryError(err instanceof Error ? err.message : 'Could not load history.');
                    setHistory([]);
                  });
              }}
            >
              Retry
            </Button>
          </div>
        ) : history !== null && history.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<TimerIcon className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />}
              title="No focus sessions yet"
              description="Complete your first session and it will show up here."
            />
          </div>
        ) : (
          <ol className="mt-4 divide-y divide-border">
            {(history ?? []).map((item) => {
              const started = new Date(item.startedAt);
              const timeLabel = Number.isNaN(started.getTime())
                ? 'Unknown time'
                : started.toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {timeLabel} · planned {item.plannedMinutes}m · actual {item.actualMinutes}m
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-medium',
                      item.completed
                        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    )}
                  >
                    {item.completed ? 'Completed' : 'Stopped'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

export default FocusTimer;

