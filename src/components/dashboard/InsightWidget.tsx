'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Mount } from '@/components/motion/Mount';

interface Insight {
  id: string;
  period: string;
  summary: string;
  wins: string;
  suggestions: string;
  generatedAt: Date;
}

export function InsightWidget() {
  const reduce = useReducedMotion();
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * A failed insight load. Previously `console.error` only, so the card
   * rendered its "no insight yet" empty state — which invites the user to
   * generate one, when in fact generation is fine and the *read* is broken.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchLatestInsight = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch('/api/insights/latest?period=WEEKLY');
      if (!res.ok) {
        throw new Error(`Could not load your latest insight (status ${res.status})`);
      }
      const data = await res.json();
      if (data.success && data.data) {
        setInsight(data.data);
      } else if (data.success) {
        // A genuine "nothing generated yet" is a legitimate empty state.
        setInsight(null);
      } else {
        throw new Error(data.error || 'Could not load your latest insight');
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load your latest insight'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void fetchLatestInsight();
  }, [fetchLatestInsight]);

  async function generateNewInsight() {
    setGenerating(true);
    setNotice(null);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const res = await fetch('/api/insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: 'WEEKLY',
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInsight(data.data);
      } else if (res.status === 503) {
        setNotice(
          data?.error === 'AI insights not configured'
            ? 'AI insights are not configured (missing API key). Your dashboard works fine without them.'
            : 'The AI service is temporarily unavailable. Please try again later.'
        );
      } else {
        setNotice(data?.error || 'Could not generate an insight right now.');
      }
    } catch (error) {
      console.error('Error generating insight:', error);
      setNotice('Could not reach the insights service. Please try again later.');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6" aria-busy="true" aria-label="Loading insights">
        <Skeleton shine className="mb-4 h-6 w-1/2" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Card>
    );
  }

  if (!insight) {
    return (
      <Card className="p-6 fade-rise-in">
        <h3 className="text-lg font-semibold mb-4">AI Insights</h3>
        {loadError ? (
          <>
            {/* A failed read is not the same as "no insight generated yet", and
                offering "Generate Insight" here would invite the user to pay for
                a regeneration to fix a request that never worked. */}
            <p role="alert" className="mb-4 text-sm text-destructive">
              {loadError}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                void fetchLatestInsight();
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground mb-4">
              Get personalized insights powered by AI
            </p>
            {notice && (
              <p role="status" className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                {notice}
              </p>
            )}
            <Button onClick={generateNewInsight} disabled={generating}>
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {generating ? 'Generating...' : 'Generate Insight'}
            </Button>
          </>
        )}
      </Card>
    );
  }

  const wins = insight.wins.split('\n').filter(Boolean);
  const suggestions = insight.suggestions.split('\n').filter(Boolean);

  return (
    <Mount>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">AI Insights</h3>
          <Button variant="ghost" size="sm" onClick={generateNewInsight} disabled={generating}>
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">🔄</span>
            )}
          </Button>
        </div>

        <motion.div
          key={insight.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
          {notice && (
            <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {notice}
            </p>
          )}
          {/* Summary */}
          <div>
            <p className="text-sm text-foreground">{insight.summary}</p>
          </div>

{/* Wins */}
          {wins.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-emerald-700 dark:text-emerald-400">Wins</h4>
              <ul className="space-y-1">
                {wins.slice(0, 2).map((win, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    • {win}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-sky-700 dark:text-sky-400">
                Suggestions
              </h4>
              <ul className="space-y-1">
                {suggestions.slice(0, 3).map((suggestion, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    • {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-muted-foreground/80 pt-2 border-t border-border">
            Generated {new Date(insight.generatedAt).toLocaleDateString()}
          </div>
        </motion.div>
      </Card>
    </Mount>
  );
}

export default InsightWidget;