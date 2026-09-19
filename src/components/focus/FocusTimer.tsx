'use client';

/**
 * FocusTimer — pomodoro-style focus timer.
 *
 * Cycles through WORK, SHORT_BREAK and LONG_BREAK phases with configurable
 * durations (defaults come from `POMODORO_DEFAULTS`). Features start/pause/
 * reset, phase switching, an SVG progress ring, a guarded tick sound, and an
 * `onComplete` callback that fires whenever a work phase finishes. Phase
 * transitions auto-advance; whether a break auto-starts is controlled by
 * `autoStartBreak`.
 *
 * Usage:
 *   <FocusTimer onComplete={(cycles) => console.log(`cycle ${cycles}`)} />
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coffee, Pause, Play, RotateCcw, Timer as TimerIcon, Sparkles } from 'lucide-react';
import { POMODORO_DEFAULTS, durationForPhase, nextPhaseFor, type FocusPhase } from '@/lib/focus/pomodoro';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export interface FocusTimerProps {
  workMinutes?: number;
  shortBreak?: number;
  longBreak?: number;
  cyclesBeforeLongBreak?: number;
  soundEnabled?: boolean;
  autoStartBreak?: boolean;
  onComplete?: (completedWorkCycles: number) => void;
  onPhaseChange?: (phase: FocusPhase) => void;
  className?: string;
}

const PHASE_META: Readonly<Record<FocusPhase, { label: string; color: string }>> = {
  WORK: { label: 'Focus', color: '#3b82f6' },
  SHORT_BREAK: { label: 'Short break', color: '#22c55e' },
  LONG_BREAK: { label: 'Long break', color: '#8b5cf6' },
};

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

let audioContext: AudioContext | null = null;

/** Play a short tick. Every failure is swallowed — audio must never break the timer. */
function playTick(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.08);
  } catch {
    // Ignore: autoplay policies or unavailable audio hardware.
  }
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function FocusTimer({
  workMinutes = POMODORO_DEFAULTS.workMinutes,
  shortBreak = POMODORO_DEFAULTS.shortBreak,
  longBreak = POMODORO_DEFAULTS.longBreak,
  cyclesBeforeLongBreak = POMODORO_DEFAULTS.cyclesBeforeLongBreak,
  soundEnabled = true,
  autoStartBreak = false,
  onComplete,
  onPhaseChange,
  className,
}: FocusTimerProps) {
  const [phase, setPhase] = useState<FocusPhase>('WORK');
  const [remaining, setRemaining] = useState(() => workMinutes * 60);
  const [running, setRunning] = useState(false);
  const [completedCycles, setCompletedCycles] = useState(0);

  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const phaseChangeRef = useRef(onPhaseChange);
  phaseChangeRef.current = onPhaseChange;

  const phaseRef = useRef<FocusPhase>(phase);
  phaseRef.current = phase;
  const cyclesRef = useRef<number>(completedCycles);
  cyclesRef.current = completedCycles;
  const cyclesBeforeRef = useRef<number>(cyclesBeforeLongBreak);
  cyclesBeforeRef.current = cyclesBeforeLongBreak;
  const autoStartBreakRef = useRef<boolean>(autoStartBreak);
  autoStartBreakRef.current = autoStartBreak;

  const totalSeconds = useMemo(() => durationForPhase(phase) * 60, [phase]);

  // Countdown ticker.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const completePhase = useCallback(() => {
    const currentPhase = phaseRef.current;
    const currentCycles = cyclesRef.current;

    let nextCycles = currentCycles;
    if (currentPhase === 'WORK') {
      nextCycles = currentCycles + 1;
      cyclesRef.current = nextCycles;
      setCompletedCycles(nextCycles);
      completeRef.current?.(nextCycles);
    }

    const nextPhase = nextPhaseFor(currentPhase, currentCycles, cyclesBeforeRef.current);
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
    setRemaining(durationForPhase(nextPhase) * 60);
    phaseChangeRef.current?.(nextPhase);

    const enteringBreak = nextPhase !== 'WORK';
    if (enteringBreak && !autoStartBreakRef.current) {
      setRunning(false);
    }
  }, []);

  // Watch for the timer hitting zero and advance phases.
  useEffect(() => {
    if (running && remaining === 0) completePhase();
  }, [remaining, running, completePhase]);

  // Guarded tick sound (only when a whole second actually elapses).
  useEffect(() => {
    if (!running || !soundEnabled || remaining <= 0 || remaining >= totalSeconds) return;
    playTick();
  }, [remaining, running, soundEnabled, totalSeconds]);

  const switchPhase = (next: FocusPhase) => {
    phaseRef.current = next;
    setPhase(next);
    setRemaining(durationForPhase(next) * 60);
    setRunning(false);
    phaseChangeRef.current?.(next);
  };

  const reset = () => switchPhase('WORK');

  const toggleRunning = () => {
    if (remaining === 0) return;
    setRunning((value) => !value);
  };

  const progress = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const dashOffset = RING_CIRCUMFERENCE * progress;
  const meta = PHASE_META[phase];
  const showPlaceholder = !running;

  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      <div className="flex items-center gap-2">
        {(['WORK', 'SHORT_BREAK', 'LONG_BREAK'] as FocusPhase[]).map((mode) => {
          const active = phase === mode;
          const Icon = mode === 'WORK' ? TimerIcon : mode === 'SHORT_BREAK' ? Coffee : Sparkles;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => switchPhase(mode)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2',
                active
                  ? 'border-transparent text-white'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              )}
              style={active ? { backgroundColor: PHASE_META[mode].color } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {PHASE_META[mode].label}
            </button>
          );
        })}
      </div>

      <div className="relative flex items-center justify-center" aria-live="polite">
        <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label={`${meta.label} timer`}>
          <circle cx="120" cy="120" r={RING_RADIUS} fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle
            cx="120"
            cy="120"
            r={RING_RADIUS}
            fill="none"
            stroke={meta.color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 120 120)"
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-5xl font-bold tabular-nums text-gray-900" aria-label={formatTime(remaining)}>
            {formatTime(remaining)}
          </span>
          <span className="mt-1 text-xs font-medium uppercase tracking-wide" style={{ color: meta.color }}>
            {showPlaceholder && !running ? 'Paused' : meta.label}
          </span>
          {completedCycles > 0 && (
            <span className="mt-1 text-xs text-gray-400">
              {completedCycles} {completedCycles === 1 ? 'pomodoro' : 'pomodoros'} completed
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={reset} aria-label="Reset timer">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
        <Button
          onClick={toggleRunning}
          disabled={remaining === 0}
          aria-label={running ? 'Pause timer' : 'Start timer'}
        >
          {running ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
          {running ? 'Pause' : 'Start'}
        </Button>
      </div>
    </div>
  );
}

export default FocusTimer;