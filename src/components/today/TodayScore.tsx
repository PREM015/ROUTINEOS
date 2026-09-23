'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { SCORE_GRADES, type ScoreGrade } from '@/types/score';
import { useCountUp } from '@/components/motion/useCountUp';
import { Mount } from '@/components/motion/Mount';

interface TodayScoreProps {
  date: string;
}

export function TodayScore({ date }: TodayScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [grade, setGrade] = useState<ScoreGrade | null>(null);
  const [loading, setLoading] = useState(true);
  const display = useCountUp(score || 0, 1);

  const fetchScore = useCallback(async () => {
    try {
      const res = await fetch(`/api/score/${date}`);
      const data = await res.json();

      if (data.success) {
        setScore(data.data.totalScore);
        setGrade(data.data.overallGrade);
      }
    } catch {
      // Score might not exist yet
      setScore(0);
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

  const scoreValue = score || 0;
  const gradeInfo = grade ? SCORE_GRADES[grade] : SCORE_GRADES['F'];

  return (
    <Mount>
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Today&apos;s Score</h3>

        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="flex items-baseline gap-2 mb-2">
              <span
                className="text-5xl font-bold tabular-nums transition-[color] duration-500"
                style={{ color: gradeInfo.color }}
              >
                {Math.round(display)}
              </span>
              <span className="text-gray-600">/ 100</span>
            </div>
            <div
              className="inline-block px-3 py-1 rounded-full text-sm font-semibold transition-[background-color,color] duration-500"
              style={{
                backgroundColor: `${gradeInfo.color}20`,
                color: gradeInfo.color,
              }}
            >
              Grade: {grade || 'F'}
            </div>
          </div>

          <div className="flex-1">
            <Progress value={scoreValue} className="h-4 mb-2" />
            <p className="text-sm text-gray-600">{gradeInfo.description}</p>
          </div>
        </div>
      </Card>
    </Mount>
  );
}