'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { SCORE_GRADES, type ScoreGrade } from '@/types/score';

interface TodayScoreProps {
  date: string;
}

export function TodayScore({ date }: TodayScoreProps) {
  const [score, setScore] = useState<number | null>(null);
  const [grade, setGrade] = useState<ScoreGrade | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScore();
  }, [date]);

  async function fetchScore() {
    try {
      const res = await fetch(`/api/score/${date}`);
      const data = await res.json();
      
      if (data.success) {
        setScore(data.data.totalScore);
        setGrade(data.data.overallGrade);
      }
    } catch (error) {
      // Score might not exist yet
      setScore(0);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  const scoreValue = score || 0;
  const gradeInfo = grade ? SCORE_GRADES[grade] : SCORE_GRADES['F'];

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Today's Score</h3>

      <div className="flex items-center gap-6">
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-5xl font-bold" style={{ color: gradeInfo.color }}>
              {Math.round(scoreValue)}
            </span>
            <span className="text-gray-600">/ 100</span>
          </div>
          <div
            className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: `${gradeInfo.color}20`,
              color: gradeInfo.color,
            }}
          >
            Grade: {grade || 'F'}
          </div>
        </div>

        <div className="flex-1">
          <Progress
            value={scoreValue}
            className="h-4 mb-2"
          />
          <p className="text-sm text-gray-600">{gradeInfo.description}</p>
        </div>
      </div>
    </Card>
  );
}