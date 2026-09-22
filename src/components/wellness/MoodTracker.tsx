"use client";

/**
 * MoodTracker — a quick "how are you feeling?" check-in. Loads today's latest
 * mood log from GET /api/wellness/mood and submits new check-ins to
 * POST /api/wellness/mood.
 *
 * Usage:
 *   <MoodTracker onLogged={(log) => refresh()} />
 */
import * as React from 'react';
import { HeartPulse, Save } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Smile, Meh, Frown } from 'lucide-react';

export interface MoodTrackerProps {
  onLogged?: () => void;
  className?: string;
}

function dateStringOf(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export default function MoodTracker({ onLogged, className }: MoodTrackerProps) {
  const [mood, setMood] = React.useState<number | null>(null);
  const [energy, setEnergy] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const logs = await apiRequest<{ timestamp: string; mood: number; energy?: number | null }[]>(
          '/api/wellness/mood',
          { query: { limit: 10 } },
        );
        if (cancelled) return;
        const today = new Date().toISOString().slice(0, 10);
        const todaysLog = logs.find((log) => dateStringOf(log.timestamp) === today);
        if (todaysLog) {
          setMood(todaysLog.mood);
          setEnergy(todaysLog.energy ?? null);
          setMessage(`Checked in at ${new Date(todaysLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load your latest check-in');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    if (saving || mood === null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/wellness/mood', {
        method: 'POST',
        body: {
          mood,
          ...(energy !== null ? { energy } : {}),
        },
      });
      setMessage('Check-in saved');
      onLogged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save check-in');
    } finally {
      setSaving(false);
    }
  };

  const moods: readonly { value: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: 1, icon: Frown },
    { value: 2, icon: Frown },
    { value: 3, icon: Meh },
    { value: 4, icon: Smile },
    { value: 5, icon: Smile },
  ];

  return (
    <Card className={cn('p-5', className)}>
      <div className="mb-4 flex items-center gap-2">
        <HeartPulse className="h-5 w-5 text-pink-600" />
        <h2 className="text-lg font-semibold text-gray-900">How are you feeling?</h2>
      </div>

      {loading ? (
        <p className="py-4 text-sm text-gray-500">Loading today&apos;s check-in…</p>
      ) : (
        <>
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Mood</span>
              <div className="flex items-center gap-2" role="group" aria-label="Mood rating">
                {moods.map(({ value, icon: Icon }) => {
                  const selected = mood === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMood(mood === value ? null : value)}
                      aria-pressed={selected}
                      aria-label={`Mood ${value} of 5`}
                      title={`Mood ${value} of 5`}
                      className={cn(
                        'inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                        selected
                          ? 'border-pink-500 bg-pink-50 text-pink-600'
                          : 'border-gray-300 bg-white text-gray-400 hover:bg-gray-50',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Energy (optional)</span>
              <div className="flex items-center gap-2" role="group" aria-label="Energy rating">
                {[1, 2, 3, 4, 5].map((value) => {
                  const selected = energy === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEnergy(energy === value ? null : value)}
                      aria-pressed={selected}
                      aria-label={`Energy ${value} of 5`}
                      className={cn(
                        'inline-flex h-10 min-w-10 items-center justify-center rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                        selected
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
          {message && (
            <p className="mt-3 text-sm text-green-600" aria-live="polite">
              {message}
            </p>
          )}

          <Button
            className="mt-4"
            onClick={() => void save()}
            isLoading={saving}
            disabled={mood === null}
          >
            {!saving && <Save className="mr-1.5 h-4 w-4" />}
            Check in
          </Button>
        </>
      )}
    </Card>
  );
}