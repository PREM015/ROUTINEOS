'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { GlassPanel, PanelHeader, PanelSkeleton, Tag } from '@/components/today/ui';
  import { DailyScoreBreakdown, type DailyScoreView } from '@/components/today/ScoreBreakdown';
  import { ScoreTrend } from '@/components/today/ScoreTrend';
import { Trophy } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { onTodayDataChanged } from '@/lib/today-sync';
import { formatDisplayDate } from '@/lib/dates';
import type { ScoreGrade } from '@/types/score';

interface TodayScoreProps {
  date: string;
}

const EMPTY: DailyScoreView = {
  totalScore: null,
  overallGrade: null,
  coreScore: null,
  growthScore: null,
  bonusScore: null,
  habitCompletionRate: null,
  routineCompletionRate: null,
  sleepScore: null,
};

export function TodayScore({ date }: TodayScoreProps) {
  const [data, setData] = useState<DailyScoreView>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(
    async (options: { background?: boolean } = {}) => {
      /**
       * Same `background` rule as the habit card: a refetch triggered by a write
       * elsewhere on the page must swap the data **in place**. Showing the
       * skeleton would tear down and rebuild the whole card on every habit
       * tick, and make the number the user just changed flicker away and back.
       */
      if (!options.background) setLoading(true);
      setError(null);
      try {
        // `apiRequest` unwraps `{ success, data }`.
        const res = await apiRequest<DailyScoreView>(`/api/score/${date}`);
        setData({
          totalScore: res.totalScore ?? null,
          overallGrade: (res.overallGrade as ScoreGrade | undefined) ?? null,
          coreScore: res.coreScore ?? null,
          growthScore: res.growthScore ?? null,
          bonusScore: res.bonusScore ?? null,
          habitCompletionRate: res.habitCompletionRate ?? null,
          routineCompletionRate: res.routineCompletionRate ?? null,
          sleepScore: res.sleepScore ?? null,
        });
      } catch (err) {
        // Previously `catch { setScore(0) }`, which reported a failed request to
        // the user as a genuinely terrible day. An unavailable score now says so.
        if (!options.background) setData(EMPTY);
        setError(err instanceof ApiError ? err.message : "Couldn't load today's score");
      } finally {
        if (!options.background) setLoading(false);
      }
    },
    [date]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void fetchScore();
  }, [fetchScore]);

  // A habit tick, a routine-block log or a sleep write all change this row
  // server-side.
  useEffect(
    () => onTodayDataChanged(() => void fetchScore({ background: true })),
    [fetchScore]
  );

  if (loading) {
    return <PanelSkeleton rows={6} className="min-h-[16rem]" />;
  }

  return (
    <GlassPanel accent="score" className="h-full">
      <PanelHeader
        title="Score"
        icon={<Trophy className="h-4 w-4 text-accent-score" aria-hidden="true" />}
        action={
          error ? (
            <Tag tone="danger">Unavailable</Tag>
          ) : (
            <span className="text-xs capitalize text-muted-foreground">
              {formatDisplayDate(date)}
            </span>
          )
        }
      />

      <div className="px-5 pb-5">
        {error ? (
          <div className="flex flex-col">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 self-start"
              onClick={() => void fetchScore()}
            >
              Try again
            </Button>
          </div>
        ) : data.totalScore === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
            {/*
              A static element, deliberately NOT a `Skeleton`. `Skeleton`
              defaults to `animate-pulse`, so using one here meant an infinite
              shimmer sat where the score goes — all day, for anyone who had
              logged nothing.
            */}
            <Trophy className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No score yet for today</p>
            <p className="max-w-[22rem] text-xs text-muted-foreground">
              Tick a habit, complete a routine block, or log some sleep and this fills in
              straight away.
            </p>
          </div>
        ) : (
          <>
            <DailyScoreBreakdown data={data} />
            {/*
              A seven-day trend, inside this card rather than beside it.

              Adds a question the page previously could not answer — "am I
              improving?" — without adding a ninth card. Renders nothing until
              there are at least three scored days, so a new user sees exactly the
              card they saw before.
            */}
            <ScoreTrend date={date} />
          </>
        )}
      </div>
    </GlassPanel>
  );
}