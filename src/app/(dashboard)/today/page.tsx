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
import { Mount } from '@/components/motion/Mount';
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
      <Mount>
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Today</h1>
          <p className="text-muted-foreground">
            {formatInTimeZone(new Date(), timezone, 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
      </Mount>

      <div className="space-y-6">
        {/* Quick Actions */}
        <Mount delay={0.06}><QuickActions date={today} /></Mount>

        {/* Current Routine Block */}
        <Mount delay={0.12}><CurrentRoutineBlock /></Mount>

        {/* Today's Score */}
        <Mount delay={0.18}><TodayScore date={today} /></Mount>

        {/* Streak */}
        <Mount delay={0.24}><StreakCard /></Mount>

        {/* Today's Habits */}
        <Mount delay={0.3}><TodayHabitChecklist date={today} /></Mount>

        {/* Today's Goals */}
        <Mount delay={0.36}><TodayGoals date={today} /></Mount>

        {/* Sleep */}
        <Mount delay={0.42}><TodaySleep date={today} /></Mount>

        {/* Daily Reflection */}
        <Mount delay={0.48}><DailyReflection date={today} /></Mount>
      </div>
    </div>
  );
}