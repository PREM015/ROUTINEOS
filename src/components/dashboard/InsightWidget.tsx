'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Insight {
  id: string;
  period: string;
  summary: string;
  wins: string;
  suggestions: string;
  generatedAt: Date;
}

export function InsightWidget() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchLatestInsight = useCallback(async () => {
    try {
      const res = await fetch('/api/insights/latest?period=WEEKLY');
      const data = await res.json();
      if (data.success && data.data) {
        setInsight(data.data);
      }
    } catch (error) {
      console.error('Error fetching insight:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchLatestInsight().catch(() => undefined);
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
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (!insight) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">AI Insights</h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Get personalized insights powered by AI
        </p>
        {notice && (
          <p role="status" className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            {notice}
          </p>
        )}
        <Button onClick={generateNewInsight} disabled={generating}>
          {generating ? 'Generating...' : 'Generate Insight'}
        </Button>
      </Card>
    );
  }

  const wins = insight.wins.split('\n').filter(Boolean);
  const suggestions = insight.suggestions.split('\n').filter(Boolean);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">AI Insights</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={generateNewInsight}
          disabled={generating}
        >
          {generating ? '...' : '🔄'}
        </Button>
      </div>

      <div className="space-y-4">
        {notice && (
          <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            {notice}
          </p>
        )}
        {/* Summary */}
        <div>
          <p className="text-sm text-gray-900 dark:text-gray-100">{insight.summary}</p>
        </div>

        {/* Wins */}
        {wins.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-green-700 dark:text-green-400">✨ Wins</h4>
            <ul className="space-y-1">
              {wins.slice(0, 2).map((win, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                  • {win}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-blue-700 dark:text-blue-400">
              💡 Suggestions
            </h4>
            <ul className="space-y-1">
              {suggestions.slice(0, 3).map((suggestion, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                  • {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-border">
          Generated {new Date(insight.generatedAt).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );
}

export default InsightWidget;