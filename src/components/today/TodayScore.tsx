'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { SCORE_GRADES, type ScoreGrade } from '@/types/score';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useCountUp } from '@/components/motion/useCountUp';
import { Mount } from '@/components/motion/Mount';

interface TodayScoreProps {
  date: string;
}

export function TodayScore({ date }: TodayScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [grade, setGrade] = useState<ScoreGrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const display = useCountUp(score || 0, 1);

  const fetchScore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `apiRequest` unwraps `{ success, data }`. This route used to return the
      // bare score row, so the `if (data.success)` guard below never passed and
      // the card permanently rendered 0 / Grade F.
      const data = await apiRequest<{ totalScore: number; overallGrade: ScoreGrade }>(
        `/api/score/${date}`
      );
      setScore(data.totalScore);
      setGrade(data.overallGrade);
    } catch (err) {
      // Previously `catch { setScore(0) }`, which reported a failed request to
      // the user as a genuinely terrible day. An unavailable score now says so.
      setScore(null);
      setGrade(null);
      setError(err instanceof ApiError ? err.message : "Couldn't load today's score");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    fetchScore();
  }, [fetchScore]);

  if (loading) {
    return (
      <Card className="p-6" aria-busy="true" aria-label="Loading today's score">
        <Skeleton shine className="mb-4 h-6 w-1/3" />
        <div className="flex gap-6">
          <Skeleton className="h-24 w-40 max-w-full" />
          <Skeleton className="h-24 flex-1" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6" role="alert">
        <h3 className="text-lg font-semibold">Today&apos;s Score</h3>
        <p className="mt-2 text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void fetchScore()}
        >
          Try again
        </Button>
      </Card>
    );
  }

  const scoreValue = score || 0;
  const gradeInfo = grade ? SCORE_GRADES[grade] : SCORE_GRADES['F'];

  return (
    <Mount>
      <Card className="glow-primary p-6">
        <h3 className="text-lg font-semibold mb-4">Today&apos;s Score</h3>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-28 w-28 rounded-full">
              <div
                className="conic-gradient-ring absolute inset-0 rounded-full"
                style={{ '--p': `${scoreValue}%` } as CSSProperties}
                aria-hidden="true"
              />
              <div className="absolute inset-1.5 flex items-center justify-center rounded-full glass-panel shadow-soft">
                <span
                  className="text-3xl font-bold tabular-nums transition-[color] duration-500"
                  style={{ color: gradeInfo.color }}
                >
                  {Math.round(display)}
                </span>
              </div>
            </div>
            <div
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-[background-color,color] duration-500"
              style={{
                backgroundColor: `${gradeInfo.color}20`,
                color: gradeInfo.color,
              }}
            >
              <span>{gradeInfo.label}</span>
              <span>Grade</span>
            </div>
          </div>

          <div className="flex-1">
            <Progress value={scoreValue} className="h-4 mb-2" />
            <p className="text-sm text-muted-foreground">{gradeInfo.description}</p>
          </div>
        </div>
      </Card>
    </Mount>
  );
}