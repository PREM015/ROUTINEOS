'use client';

import { useState } from 'react';
import { Timer, CheckCircle2 } from 'lucide-react';
import { POMODORO_DEFAULTS, type FocusPhase } from '@/lib/focus/pomodoro';
import { FocusTimer } from '@/components/focus/FocusTimer';
import { PomodoroSettings, type PomodoroSettingsValue } from '@/components/focus/PomodoroSettings';
import { BreakNotification } from '@/components/focus/BreakNotification';
import { FocusStats } from '@/components/focus/FocusStats';

/**
 * Focus Page
 * Pomodoro timer plus a focus dashboard. Timer preferences live on this device
 * and drive both the timer and the break reminder.
 */
export default function FocusPage() {
  const [settings, setSettings] = useState<PomodoroSettingsValue>({
    workMinutes: POMODORO_DEFAULTS.workMinutes,
    shortBreak: POMODORO_DEFAULTS.shortBreak,
    longBreak: POMODORO_DEFAULTS.longBreak,
    cyclesBeforeLongBreak: POMODORO_DEFAULTS.cyclesBeforeLongBreak,
    autoStartFocus: false,
    autoStartBreak: false,
  });
  const [phase, setPhase] = useState<FocusPhase>('WORK');
  const [showBreak, setShowBreak] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<number | null>(null);

  const handlePhaseChange = (next: FocusPhase) => {
    setPhase(next);
    setShowBreak(next === 'SHORT_BREAK' || next === 'LONG_BREAK');
  };

  const handleComplete = (completedCycles: number) => {
    setLastCompleted(completedCycles);
  };

  const phaseLabel =
    phase === 'WORK' ? 'Deep focus' : phase === 'SHORT_BREAK' ? 'Short break' : 'Long break';

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Timer className="h-7 w-7 text-blue-600" />
          Focus
        </h1>
        <p className="mt-2 text-gray-600">
          Run a pomodoro session, take planned breaks, and watch your focus minutes add up.
        </p>
      </div>

      {showBreak && (
        <div className="mb-6">
          <BreakNotification
            onDismiss={() => setShowBreak(false)}
            onTakeBreak={() => setShowBreak(false)}
          />
        </div>
      )}

      {lastCompleted !== null && (
        <p
          aria-live="polite"
          className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          <CheckCircle2 className="h-4 w-4" />
          Nice work — {lastCompleted} {lastCompleted === 1 ? 'pomodoro' : 'pomodoros'} completed this
          session.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Pomodoro timer</h2>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {phaseLabel}
              </span>
            </div>
            <FocusTimer
              workMinutes={settings.workMinutes}
              shortBreak={settings.shortBreak}
              longBreak={settings.longBreak}
              cyclesBeforeLongBreak={settings.cyclesBeforeLongBreak}
              autoStartBreak={settings.autoStartBreak}
              onComplete={handleComplete}
              onPhaseChange={handlePhaseChange}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <PomodoroSettings onChange={setSettings} />
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Your focus activity</h2>
        <FocusStats />
      </div>
    </div>
  );
}
