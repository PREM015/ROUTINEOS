'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useFocusSettings } from '@/hooks/useFocusSettings';
import { minutesFor } from '@/lib/focus/durations';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/**
 * /settings/focus
 *
 * Reads and writes `FocusSettings` through `PUT /api/focus/settings`, which takes a
 * **patch**. That is why each control below sends only its own field: a whole-row save
 * would reset every section the user had not touched.
 *
 * Kept separate from the shared `UserSettings` store deliberately - see the note on
 * `useFocusSettings` for why focus configuration is not folded into it.
 */

const FOCUS_LENGTHS = [5, 10, 15, 20, 25, 30, 45, 50, 60, 90, 120].map((m) => ({
  value: String(m),
  label: m < 60 ? `${m} minutes` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`,
}));

const BREAK_LENGTHS = [1, 2, 3, 5, 10, 15, 20, 30].map((m) => ({
  value: String(m),
  label: `${m} minutes`,
}));

const REFLECTION_MODES = [
  { value: 'ALWAYS', label: 'Every session' },
  { value: 'FOCUS_ONLY', label: 'Focus blocks only' },
  { value: 'MIN_LENGTH', label: 'Only blocks over a minimum length' },
  { value: 'NEVER', label: 'Never' },
] as const;

export function FocusSettingsClient() {
  const { settings, loading, error, saving, save } = useFocusSettings();
  const [pending, setPending] = useState<string | null>(null);

  /**
   * One writer for every control.
   *
   * `field` is typed against the patch so a typo is a compile error rather than a
   * silently-stripped key - `focusSettingsPatchSchema` is a plain `z.object`, so an
   * unknown key would be dropped by the server and the UI would appear to save.
   */
  async function update<K extends keyof typeof settings>(field: K, value: (typeof settings)[K]) {
    setPending(String(field));
    try {
      await save({ [field]: value } as Parameters<typeof save>[0]);
    } catch {
      toast.error('Could not save focus settings');
    } finally {
      setPending(null);
    }
  }

  if (loading && !settings.id) {
    return <p className="text-sm text-muted-foreground">Loading focus settings…</p>;
  }

  if (error) {
    return (
      <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }

  const busy = saving || pending !== null;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Timer lengths</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          These replace the 25-minute block the timer used to assume. A running session keeps
          the length it started with; the new value applies to the next one.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Focus block</span>
            <Select
              options={FOCUS_LENGTHS}
              value={String(settings.focusMinutes)}
              onChange={(event) => update('focusMinutes', Number(event.target.value))}
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Short break</span>
            <Select
              options={BREAK_LENGTHS}
              value={String(settings.shortBreakMinutes)}
              onChange={(event) => update('shortBreakMinutes', Number(event.target.value))}
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Long break</span>
            <Select
              options={BREAK_LENGTHS}
              value={String(settings.longBreakMinutes)}
              onChange={(event) => update('longBreakMinutes', Number(event.target.value))}
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Blocks before a long break
            </span>
            <Select
              options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              value={String(settings.cyclesBeforeLongBreak)}
              onChange={(event) => update('cyclesBeforeLongBreak', Number(event.target.value))}
              disabled={busy}
            />
          </label>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Flow</h2>
        <Switch
          label="Start breaks automatically"
          description="Move straight into a break when a focus block ends."
          checked={settings.autoStartBreak}
          onChange={(checked) => update('autoStartBreak', checked)}
          disabled={busy}
        />
        <Switch
          label="Resume focus automatically"
          description="Start the next focus block as soon as a break ends. Off by default, because leaving it on produces an unbroken chain of blocks nobody asked for."
          checked={settings.autoStartFocus}
          onChange={(checked) => update('autoStartFocus', checked)}
          disabled={busy}
        />
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Goals</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Daily target</span>
            <Select
              options={[30, 45, 60, 90, 120, 180, 240, 360, 480].map((m) => ({
                value: String(m),
                label: minutesFor('focus', { focusMinutes: m, shortBreakMinutes: 5, longBreakMinutes: 15 })
                  ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h`
                  : `${m}m`,
              }))}
              value={String(settings.dailyTargetMinutes)}
              onChange={(event) => update('dailyTargetMinutes', Number(event.target.value))}
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">
              Minutes that count for a streak day
            </span>
            <Select
              options={FOCUS_LENGTHS}
              value={String(settings.streakDayMinutes)}
              onChange={(event) => update('streakDayMinutes', Number(event.target.value))}
              disabled={busy}
              helperText="Below this, opening the app and tapping start is enough to hold a streak, which makes the streak meaningless."
            />
          </label>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Reflection</h2>
        <Select
          label="When to ask for a reflection"
          options={REFLECTION_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
          value={settings.reflectionMode}
          onChange={(event) =>
            update('reflectionMode', event.target.value as typeof settings.reflectionMode)
          }
          disabled={busy}
        />
        {settings.reflectionMode === 'MIN_LENGTH' && (
          <Select
            label="Minimum block length that asks"
            options={FOCUS_LENGTHS}
            value={String(settings.reflectionMinimumMinutes)}
            onChange={(event) =>
              update('reflectionMinimumMinutes', Number(event.target.value))
            }
            disabled={busy}
          />
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Sound</h2>
        <Switch
          label="Play sounds"
          description="Off by default. A focus tool that makes noise unasked is a nuisance."
          checked={settings.soundEnabled}
          onChange={(checked) => update('soundEnabled', checked)}
          disabled={busy}
        />
        {settings.soundEnabled && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-foreground">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.soundVolume}
              disabled={busy}
              onChange={(event) => update('soundVolume', Number(event.target.value))}
              aria-label="Sound volume"
              className="w-full"
            />
          </label>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-foreground">Display</h2>
        <Switch
          label="Show the wall clock"
          checked={settings.showWallClock}
          onChange={(checked) => update('showWallClock', checked)}
          disabled={busy}
        />
        <Switch
          label="Suggest breaks"
          description="Offer a break when a block runs long, rather than only at the end of the timebox."
          checked={settings.breakSuggestions}
          onChange={(checked) => update('breakSuggestions', checked)}
          disabled={busy}
        />
        <Switch
          label="Adaptive suggestions"
          description="Let the app adjust suggestions from your own history. Off until you opt in."
          checked={settings.adaptiveSuggestions}
          onChange={(checked) => update('adaptiveSuggestions', checked)}
          disabled={busy}
        />
      </Card>

      <Button variant="ghost" onClick={() => window.location.reload()} disabled={busy}>
        Refresh
      </Button>
    </div>
  );
}

export default FocusSettingsClient;