import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { calculateDailyScore } from '@/lib/scoring/calculate-daily-score';

import { CurrentRoutineBlock } from '@/components/today/CurrentRoutineBlock';
import { TodayHabitChecklist } from '@/components/today/TodayHabitChecklist';
import { TodayScore } from '@/components/today/TodayScore';
import { TodayGoals } from '@/components/today/TodayGoals';
import { TodaySleep } from '@/components/today/TodaySleep';
import { QuickActions } from '@/components/today/QuickActions';
import { DailyReflection } from '@/components/today/DailyReflection';

export default async function TodayPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const date = new Date().toISOString().split('T')[0];

  // 1. Fetch habits and group them
  const habits = await db.habit.findMany({ where: { userId, isActive: true } });
  
  const groupedHabits = {
    NON_NEGOTIABLE: habits.filter(h => h.tier === 'NON_NEGOTIABLE'),
    GROWTH: habits.filter(h => h.tier === 'GROWTH'),
    BONUS: habits.filter(h => h.tier === 'BONUS'),
  };

  // 2. Fetch logs
  const logsRaw = await db.habitLog.findMany({ where: { userId, date } });
  const logs = logsRaw.reduce((acc, log) => {
    acc[log.habitId] = { completed: log.completed, skipped: log.skipped };
    return acc;
  }, {} as Record<string, { completed: boolean; skipped: boolean }>);

  // 3. Score
  const score = await calculateDailyScore(userId, date, db);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Today</h1>
          <p className="text-zinc-400 mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <TodayScore score={score.score} coreScore={score.coreScore} />
      </div>

      <QuickActions date={date} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <CurrentRoutineBlock block={null} />
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-6">Habits</h2>
            {/* Note: In a real implementation, onToggle and onSkip would call an API, we just pass empty functions for server component wrapper */}
            <TodayHabitChecklist 
              habits={groupedHabits} 
              date={date} 
              logs={logs} 
              onToggle={() => {}} 
              onSkip={() => {}} 
            />
          </div>
        </div>
        
        <div className="space-y-8">
          <TodaySleep sleepLog={null} />
          <TodayGoals goals={[]} />
          <DailyReflection date={date} />
        </div>
      </div>
    </div>
  );
}
