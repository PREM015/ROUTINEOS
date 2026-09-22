import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { TodayHabitChecklist } from '@/components/today/TodayHabitChecklist';
import { CurrentRoutineBlock } from '@/components/today/CurrentRoutineBlock';
import { TodayScore } from '@/components/today/TodayScore';
import { TodayGoals } from '@/components/today/TodayGoals';
import { TodaySleep } from '@/components/today/TodaySleep';
import { DailyReflection } from '@/components/today/DailyReflection';
import { QuickActions } from '@/components/today/QuickActions';
import { StreakCard } from '@/components/streak/StreakCard';
import { getTodayString } from '@/lib/dates';
import { userService } from '@/server/services/user.service';

export default async function TodayPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  const timezone = await userService.getTimezone(session.user.id);
  const today = getTodayString(timezone);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Today</h1>
        <p className="text-gray-600">
          {formatInTimeZone(new Date(), timezone, 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      <div className="space-y-6">
        {/* Quick Actions */}
        <QuickActions date={today} />

        {/* Current Routine Block */}
        <CurrentRoutineBlock />

        {/* Today's Score */}
        <TodayScore date={today} />

        {/* Streak */}
        <StreakCard />

        {/* Today's Habits */}
        <TodayHabitChecklist date={today} />

        {/* Today's Goals */}
        <TodayGoals date={today} />

        {/* Sleep */}
        <TodaySleep date={today} />

        {/* Daily Reflection */}
        <DailyReflection date={today} />
      </div>
    </div>
  );
}