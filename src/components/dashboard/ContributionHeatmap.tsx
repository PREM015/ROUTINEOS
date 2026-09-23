'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Mount } from '@/components/motion/Mount';

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

export function ContributionHeatmap() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 365);

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

  // Group by weeks
  const weeks: DayData[][] = [];
  let currentWeek: DayData[] = [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 365);

  for (let i = 0; i < 365; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    const dayData = data.find(d => d.date === dateStr) || {
      date: dateStr,
      score: null,
      level: 0 as const,
    };

    currentWeek.push(dayData);

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  return (
    <Mount>
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Activity Overview</h3>

        <div className="overflow-x-auto">
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
                    className={`w-3 h-3 rounded-sm transition-colors duration-300 ${getLevelColor(day.level)}`}
                    title={`${day.date}: ${day.score !== null ? Math.round(day.score) : 'No data'}`}
                  />
                ))}
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map(level => (
              <div
                key={level}
                className={`w-3 h-3 rounded-sm transition-colors duration-300 ${getLevelColor(level as 0 | 1 | 2 | 3 | 4)}`}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </Card>
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