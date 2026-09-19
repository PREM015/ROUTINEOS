'use client';

/**
 * PomodoroSettings — configure focus/break durations and auto-start behaviour.
 *
 * The UserSettings model has no pomodoro columns, so this form persists to
 * localStorage (via `useLocalStorage`) and reports every save upward through
 * `onChange` for the parent to consume. Durations are clamped to sane bounds.
 *
 * Usage:
 *   <PomodoroSettings onChange={(v) => timerStore.set(v)} />
 */

import { useState } from 'react';
import { Check, Settings2 } from 'lucide-react';
import { POMODORO_DEFAULTS } from '@/lib/focus/pomodoro';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';

export interface PomodoroSettingsValue {
  workMinutes: number;
  shortBreak: number;
  longBreak: number;
  cyclesBeforeLongBreak: number;
  autoStartFocus: boolean;
  autoStartBreak: boolean;
}

export interface PomodoroSettingsProps {
  defaults?: Partial<PomodoroSettingsValue>;
  storageKey?: string;
  onChange?: (value: PomodoroSettingsValue) => void;
}

const DEFAULT_SETTINGS = (defaults: Partial<PomodoroSettingsValue> | undefined): PomodoroSettingsValue => ({
  workMinutes: POMODORO_DEFAULTS.workMinutes,
  shortBreak: POMODORO_DEFAULTS.shortBreak,
  longBreak: POMODORO_DEFAULTS.longBreak,
  cyclesBeforeLongBreak: POMODORO_DEFAULTS.cyclesBeforeLongBreak,
  autoStartFocus: false,
  autoStartBreak: false,
  ...defaults,
});

function clamp(minutes: number, min: number, max: number): number {
  if (!Number.isFinite(minutes)) return min;
  return Math.min(Math.max(Math.round(minutes), min), max);
}

export function PomodoroSettings({
  defaults,
  storageKey = 'routineos_pomodoro_settings',
  onChange,
}: PomodoroSettingsProps) {
  const [value, setValue] = useLocalStorage<PomodoroSettingsValue>(storageKey, () =>
    DEFAULT_SETTINGS(defaults)
  );
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof PomodoroSettingsValue>(
    key: K,
    next: PomodoroSettingsValue[K]
  ) => {
    setValue((current) => ({ ...current, [key]: next }));
    setSaved(false);
  };

  const handleSave = () => {
    onChange?.(value);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">Pomodoro Settings</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Tune the timer durations and auto-start behaviour. Saved on this device.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            type="number"
            min={1}
            max={120}
            label="Focus duration (minutes)"
            value={value.workMinutes}
            onChange={(event) =>
              update('workMinutes', clamp(Number(event.target.value), 1, 120))
            }
          />
          <Input
            type="number"
            min={1}
            max={120}
            label="Short break (minutes)"
            value={value.shortBreak}
            onChange={(event) =>
              update('shortBreak', clamp(Number(event.target.value), 1, 120))
            }
          />
          <Input
            type="number"
            min={1}
            max={120}
            label="Long break (minutes)"
            value={value.longBreak}
            onChange={(event) =>
              update('longBreak', clamp(Number(event.target.value), 1, 120))
            }
          />
          <Input
            type="number"
            min={1}
            max={12}
            label="Pomodoros before long break"
            value={value.cyclesBeforeLongBreak}
            onChange={(event) =>
              update('cyclesBeforeLongBreak', clamp(Number(event.target.value), 1, 12))
            }
          />
        </div>

        <div className="mt-5 space-y-4">
          <Switch
            checked={value.autoStartFocus}
            onChange={(checked) => update('autoStartFocus', checked)}
            label="Auto-start focus after a break"
          />
          <Switch
            checked={value.autoStartBreak}
            onChange={(checked) => update('autoStartBreak', checked)}
            label="Auto-start break after focus"
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave}>
            {saved && <Check className="mr-2 h-4 w-4" />}
            {saved ? 'Saved' : 'Save settings'}
          </Button>
          {saved && <span className="text-sm text-green-600">Preferences saved locally.</span>}
        </div>
      </div>
    </Card>
  );
}

export default PomodoroSettings;