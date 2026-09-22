'use client';

interface Props {
  weekStart: string;
  weekEnd: string;
  averageScore: number;
  bestDay: { date: string; score: number } | null;
  totalHabitsCompleted: number;
  goalsAchieved: number;
  streakChange: number;
}

export default function WeeklyRecap({ weekStart, weekEnd, averageScore, bestDay, totalHabitsCompleted, goalsAchieved, streakChange }: Props) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto my-4 border border-gray-100">
      <div className="flex justify-between items-end mb-6">
        <h2 className="text-xl font-bold text-gray-800">Weekly Recap</h2>
        <span className="text-sm text-gray-500">{formatDate(weekStart)} - {formatDate(weekEnd)}</span>
      </div>
      
      <div className="flex justify-center mb-8">
        <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-4 border-indigo-100">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500" style={{ clipPath: `circle(${averageScore}% at 50% 50%)` }}></div>
          <div className="text-center">
            <p className="text-3xl font-bold text-indigo-900">{Math.round(averageScore)}</p>
            <p className="text-xs text-indigo-600 uppercase">Avg Score</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
        <div className="flex flex-col">
          <span className="text-sm text-gray-500">Total Habits</span>
          <span className="text-lg font-semibold text-gray-800">{totalHabitsCompleted}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-gray-500">Goals Met</span>
          <span className="text-lg font-semibold text-gray-800">{goalsAchieved}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-gray-500">Streak Change</span>
          <span className={`text-lg font-semibold ${streakChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {streakChange >= 0 ? '+' : ''}{streakChange}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-gray-500">Best Day</span>
          <span className="text-lg font-semibold text-gray-800">{bestDay ? formatDate(bestDay.date) : 'N/A'}</span>
        </div>
      </div>
    </div>
  );
}
