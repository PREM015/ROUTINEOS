'use client';

/**
 * AIControlPanel — admin panel for triggering AI insight generation.
 *
 * Lets an admin pick a period (DAILY / WEEKLY / MONTHLY), generate an insight
 * for that window via POST /api/insights/generate and preview the latest stored
 * insight for the selected period via GET /api/insights/latest. Loading, error
 * and "not configured" (503) states are surfaced inline.
 */

import { useCallback, useEffect, useState } from 'react';
import { Brain, RefreshCw, Sparkles } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

export type InsightPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';

interface Insight {
  id: string;
  period: string;
  startDate: string;
  endDate: string;
  summary: string | null;
  wins: string | null;
  patterns: string | null;
  concerns: string | null;
  suggestions: string | null;
  nextPeriodFocus: string | null;
  generatedAt?: string;
}

const PERIOD_LABELS: Readonly<Record<InsightPeriod, string>> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

const DAYS_BACK: Readonly<Record<InsightPeriod, number>> = {
  DAILY: 0,
  WEEKLY: 6,
  MONTHLY: 29,
};

function toIsoDate(date: Date): string {
  const [iso] = date.toISOString().split('T');
  return iso ?? date.toISOString();
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toIsoDate(date);
}

function splitLines(value: string | null): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function AIControlPanel() {
  const [period, setPeriod] = useState<InsightPeriod>('WEEKLY');
  const [loading, setLoading] = useState(false);
  const [latestLoading, setLatestLoading] = useState(false);
  const [result, setResult] = useState<Insight | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async (targetPeriod: InsightPeriod) => {
    setLatestLoading(true);
    try {
      const latest = await apiRequest<Insight | null>('/api/insights/latest', {
        query: { period: targetPeriod },
      });
      setResult(latest);
      setError(null);
    } catch {
      setResult(null);
    } finally {
      setLatestLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLatest(period);
  }, [period, fetchLatest]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const generated = await apiRequest<Insight>('/api/insights/generate', {
        method: 'POST',
        body: {
          period,
          startDate: dateDaysAgo(DAYS_BACK[period]),
          endDate: toIsoDate(new Date()),
        },
      });
      setResult(generated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setError('AI insights are not configured. Add an OPENAI_API_KEY to enable generation.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to generate insight.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold">AI Control Panel</h2>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Trigger AI insights generation and preview the latest stored insight for each period.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1" role="group" aria-label="Insight period">
            {(Object.keys(PERIOD_LABELS) as InsightPeriod[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setPeriod(option)}
                aria-pressed={period === option}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                  period === option
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                )}
              >
                {PERIOD_LABELS[option]}
              </button>
            ))}
          </div>

          <Button onClick={handleGenerate} disabled={loading} isLoading={loading}>
            {loading ? 'Generating…' : 'Generate Insights'}
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Latest {PERIOD_LABELS[period]} insight
          </h3>

          {latestLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : result ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="primary">{result.period}</Badge>
                <span className="text-xs text-gray-500">
                  {result.startDate} → {result.endDate}
                </span>
              </div>

              {result.summary && <p className="text-sm text-gray-800">{result.summary}</p>}

              {splitLines(result.wins).length > 0 && (
                <InsightSection title="Wins" lines={splitLines(result.wins)} tone="green" />
              )}
              {splitLines(result.patterns).length > 0 && (
                <InsightSection title="Patterns" lines={splitLines(result.patterns)} tone="blue" />
              )}
              {splitLines(result.suggestions).length > 0 && (
                <InsightSection title="Suggestions" lines={splitLines(result.suggestions)} tone="purple" />
              )}
              {result.nextPeriodFocus && (
                <p className="mt-3 border-t border-gray-200 pt-2 text-sm text-gray-600">
                  <span className="font-medium text-gray-800">Next period focus:</span>{' '}
                  {result.nextPeriodFocus}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
              <RefreshCw className="h-4 w-4" />
              {period === 'DAILY' ? 'No insight for today yet.' : `No ${PERIOD_LABELS[period].toLowerCase()} insight yet. Click Generate to create one.`}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

const TONE_CLASSES: Readonly<Record<string, string>> = {
  green: 'text-green-700',
  blue: 'text-blue-700',
  purple: 'text-purple-700',
};

function InsightSection({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: string[];
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      <ul className={cn('mt-1 list-disc pl-5 text-sm', TONE_CLASSES[tone])}>
        {lines.map((line, index) => (
          <li key={`${title}-${index}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export default AIControlPanel;