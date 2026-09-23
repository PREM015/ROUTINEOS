'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartPulse, Smile } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Card, Spinner } from '@/components/ui';
import MoodTracker from '@/components/wellness/MoodTracker';
import MoodCalendar from '@/components/wellness/MoodCalendar';
import { MOOD_LABELS } from '@/components/journal/JournalEntry';

interface MoodLog {
  id: string;
  timestamp: string;
  mood: number;
  energy: number | null;
  note?: string | null;
}

function dateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * Mood Page
 * Log mood check-ins, view a mood heatmap and recent history.
 */
export default function MoodPage() {
  const [logs, setLogs] = useState<MoodLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<MoodLog[]>('/api/wellness/mood?limit=180');
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mood history');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const moodByDate = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const log of logs ?? []) {
      map[dateKey(log.timestamp)] = log.mood;
    }
    return map;
  }, [logs]);

  const averageMood = useMemo(() => {
    if (!logs || logs.length === 0) return null;
    return logs.reduce((sum, log) => sum + log.mood, 0) / logs.length;
  }, [logs]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <HeartPulse className="h-7 w-7 text-rose-500" />
          Mood
        </h1>
        <p className="mt-2 text-muted-foreground">
          Check in with how you feel and watch your mood patterns emerge.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MoodTracker onLogged={() => void load()} />

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Recent mood</h2>
            {averageMood !== null && (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Smile className="h-4 w-4 text-amber-500" />
                Avg {averageMood.toFixed(1)}/5
              </span>
            )}
          </div>
          {logs === null ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            <MoodCalendar moodByDate={moodByDate} />
          )}
        </Card>
      </div>

      {logs && logs.length > 0 && (
        <Card className="mt-6 divide-y divide-border p-0">
          {logs.slice(0, 10).map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  {MOOD_LABELS[log.mood] ?? `${log.mood}/5`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.timestamp).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              {log.energy !== null && log.energy !== undefined && (
                <span className="text-xs text-muted-foreground">Energy {log.energy}/5</span>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
