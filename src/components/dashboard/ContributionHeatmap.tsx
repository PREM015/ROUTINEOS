'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Mount } from '@/components/motion/Mount';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface DayData {
  date: string;
  score: number | null;
  level: 0 | 1 | 2 | 3 | 4;
}

interface DailyScoreRow {
  date: string;
  totalScore: number;
}

function getLevel(score: number | null): 0 | 1 | 2 | 3 | 4 {
  if (score === null) return 0;
  if (score >= 90) return 4;
  if (score >= 75) return 3;
  if (score >= 50) return 2;
  if (score >= 25) return 1;
  return 0;
}

const WINDOW_DAYS = 365;

export function ContributionHeatmap() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - WINDOW_DAYS);

      const res = await fetch(
        `/api/scores/daily?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`
      );
      const result = await res.json();

      if (result.success) {
        const heatmapData = result.data.map((score: DailyScoreRow) => ({
          date: score.date,
          score: score.totalScore,
          level: getLevel(score.totalScore),
        }));
        setData(heatmapData);
      }
    } catch (error) {
      console.error('Error fetching heatmap data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const weeks = useMemo<DayData[][]>(() => {
    const out: DayData[][] = [];
    let currentWeek: DayData[] = [];
    const start = new Date();
    start.setDate(start.getDate() - WINDOW_DAYS);

    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);
      const found = data.find((d) => d.date === dateStr);
      currentWeek.push(
        found ?? { date: dateStr, score: null, level: 0 as const }
      );
      if (currentWeek.length === 7) {
        out.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) out.push(currentWeek);
    return out;
  }, [data]);

  if (loading) {
    return (
      <Card className="p-6" aria-busy="true" aria-label="Loading activity heatmap">
        <Skeleton shine className="mb-4 h-6 w-1/3" />
        <div className="flex gap-1">
          {Array.from({ length: 26 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, j) => (
                <Skeleton key={j} className="h-3 w-3 rounded-sm" />
              ))}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const grid = (
    <div className="inline-flex gap-1">
      {weeks.map((week, weekIndex) => (
        <motion.div
          key={weekIndex}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: Math.min(weekIndex * 0.03, 1.2) }}
          className="flex flex-col gap-1"
        >
          {week.map((day, dayIndex) => (
            <motion.div
              key={dayIndex}
              initial={reduce ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: Math.min(dayIndex * 0.04 + weekIndex * 0.03, 1.4),
                duration: 0.5,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={cn(
                'rounded-sm transition-colors duration-300',
                expanded ? 'w-4 h-4 md:w-5 md:h-5' : 'w-3 h-3',
                getLevelColor(day.level)
              )}
              title={`${day.date}: ${day.score !== null ? Math.round(day.score) : 'No data'}`}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );

  const legend = (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Less</span>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn(
              'rounded-sm transition-colors duration-300',
              expanded ? 'w-4 h-4' : 'w-3 h-3',
              getLevelColor(level as 0 | 1 | 2 | 3 | 4)
            )}
          />
        ))}
      </div>
      <span>More</span>
    </div>
  );

  return (
    <Mount>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Activity Overview</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Last {WINDOW_DAYS} days
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="px-2"
              onClick={() => setExpanded(true)}
              aria-label="Expand heatmap to full screen"
              title="Full screen"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto pb-1">{grid}</div>
        <div className="mt-4">{legend}</div>
      </Card>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Activity heatmap — full screen"
          >
            <motion.div
              className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-xl border border-border bg-card p-6 shadow-floating"
              initial={reduce ? false : { scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between mb-4 gap-3">
                <div>
                  <h3 className="text-xl font-semibold">Activity Overview</h3>
                  <p className="text-sm text-muted-foreground">
                    Last {WINDOW_DAYS} days of logged scores
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    onClick={() => setExpanded(false)}
                    aria-label="Close full-screen view"
                    title="Close"
                  >
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2"
                    onClick={() => setExpanded(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto pb-2">{grid}</div>
              <div className="mt-4">{legend}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Mount>
  );
}

function getLevelColor(level: 0 | 1 | 2 | 3 | 4): string {
  const colors = {
    0: 'bg-muted',
    1: 'bg-emerald-500/25',
    2: 'bg-emerald-500/45',
    3: 'bg-emerald-500/70',
    4: 'bg-emerald-500',
  };
  return colors[level];
}

export default ContributionHeatmap;