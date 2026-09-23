'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Mount } from '@/components/motion/Mount';
import { getTodayString } from '@/lib/dates';
import { format, parseISO, subDays, addDays } from 'date-fns';

interface DayScore {
  date: string;
  totalScore: number;
  coreScore: number;
  growthScore: number;
  bonusScore: number;
}

export function WeeklyBarChart() {
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<DayScore[]>([]);
  const [loading, setLoading] = useState(true);

  const weekRange = useMemo(() => {
    const today = getTodayString();
    const anchor = parseISO(today);
    const start = format(subDays(anchor, 6), 'yyyy-MM-dd');
    return { start, end: today };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch(
          `/api/scores/daily?startDate=${weekRange.start}&endDate=${weekRange.end}`
        );
        const result = await res.json();
        if (!cancelled && result.success) {
          setRows(
            (result.data as DayScore[]).map((score) => ({
              date: score.date,
              totalScore: score.totalScore ?? 0,
              coreScore: score.coreScore ?? 0,
              growthScore: score.growthScore ?? 0,
              bonusScore: score.bonusScore ?? 0,
            }))
          );
        }
      } catch {
        // noop - empty state rendered below
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [weekRange]);

  const days = useMemo(() => {
    // Gap-fill the 7-day slot window so bars stay aligned.
    const anchor = parseISO(weekRange.start);
    const byDate = new Map(rows.map((row) => [row.date, row]));
    return Array.from({ length: 7 }, (_, i) => {
      const date = format(addDays(anchor, i), 'yyyy-MM-dd');
      return { date, score: byDate.get(date) ?? null };
    });
  }, [rows, weekRange]);

  const maxScore = Math.max(...days.map((d) => d.score?.totalScore ?? 0), 100);

  if (loading) {
    return (
      <Card className="p-6" aria-busy="true" aria-label="Loading weekly chart">
        <Skeleton shine className="mb-4 h-6 w-1/3" />
        <Skeleton className="h-48 w-full" />
      </Card>
    );
  }

  const hasData = days.some((d) => d.score !== null);

  return (
    <Mount>
      <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Last 7 Days</h3>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-sky-500" />
            <span>Core</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span>Growth</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span>Bonus</span>
          </div>
        </div>
      </div>

      {!hasData ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No scores recorded for the last 7 days yet.
        </p>
      ) : (
        <div className="flex items-end justify-between gap-2 sm:gap-3 h-48">
          {days.map(({ date, score }, dayIndex) => {
            const short = format(parseISO(date), 'EEE');
            const isToday = date === weekRange.end;
            const hasScore = score !== null;
            const coreHeight = hasScore ? (score.coreScore / maxScore) * 100 : 0;
            const growthHeight = hasScore ? (score.growthScore / maxScore) * 100 : 0;
            const bonusHeight = hasScore ? (score.bonusScore / maxScore) * 100 : 0;

            return (
              <div
                key={date}
                className="group relative flex-1 flex flex-col items-center gap-2"
              >
                {hasScore && (
                  <div className="absolute -top-6 pointer-events-none z-10 text-xs bg-muted border border-border text-foreground rounded-md px-2 py-1 whitespace-nowrap shadow-sm opacity-0 translate-y-1 transition-all duration-200 ease-out-expo group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
                    <div className="font-semibold mb-0.5">
                      {format(parseISO(date), 'EEE, MMM d')}
                    </div>
                    <div className="space-y-0.5 tabular-nums">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Total</span>
                        <span>{Math.round(score.totalScore)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Core</span>
                        <span>{Math.round(score.coreScore)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Growth</span>
                        <span>{Math.round(score.growthScore)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Bonus</span>
                        <span>{Math.round(score.bonusScore)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <motion.div
                  className="relative w-full flex flex-col-reverse rounded-t overflow-hidden origin-bottom"
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: dayIndex * 0.06 }}
                >
                  {hasScore ? (
                    <>
                      <div
                        className="w-full bg-amber-400 rounded-t-sm transition-colors group-hover:bg-amber-300"
                        style={{ height: `${bonusHeight}%` }}
                        title={`Bonus: ${Math.round(score.bonusScore)}`}
                      />
                      <div
                        className="w-full bg-emerald-500 transition-colors group-hover:bg-emerald-400"
                        style={{ height: `${growthHeight}%` }}
                        title={`Growth: ${Math.round(score.growthScore)}`}
                      />
                      <div
                        className="w-full bg-sky-500 rounded-b-sm transition-colors group-hover:bg-sky-400"
                        style={{ height: `${coreHeight}%` }}
                        title={`Core: ${Math.round(score.coreScore)}`}
                      />
                    </>
                  ) : (
                    <div className="w-full bg-muted/60 h-48 border-x border-b border-border/50" />
                  )}
                </motion.div>

                <div className="text-center">
                  <div
                    className={`text-xs font-medium ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}
                  >
                    {short}
                  </div>
                  {hasScore ? (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(score.totalScore)}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground/50">—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </Card>
    </Mount>
  );
}

export default WeeklyBarChart;