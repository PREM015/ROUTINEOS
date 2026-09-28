import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatInTimeZone } from 'date-fns-tz';
import { TodayHabitChecklist } from '@/components/today/TodayHabitChecklist';
import { CurrentRoutineBlock } from '@/components/today/CurrentRoutineBlock';
import { TodayDayType } from '@/components/today/TodayDayType';
import { TodayScore } from '@/components/today/TodayScore';
import { TodayGoals } from '@/components/today/TodayGoals';
import { TodaySleep } from '@/components/today/TodaySleep';
import { DailyReflection } from '@/components/today/DailyReflection';
import { Mount } from '@/components/motion/Mount';
import { StreakCard } from '@/components/streak/StreakCard';
import { getTodayString } from '@/lib/dates';
import { userService } from '@/server/services/user.service';
import { RoutineService } from '@/server/services/routine.service';

export default async function TodayPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  const timezone = await userService.getTimezone(session.user.id);
  const today = getTodayString(timezone);
  
  // Resolve the actual day type for today (respects RoutineException)
  const routineService = new RoutineService();
  const routine = await routineService.getRoutineForDate(session.user.id, today);
  const resolvedDayType = routine.dayType;

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/*
        ERROR.md A6: /today was "very boring and not mobile responsive".

        The page was a single `max-w-4xl` column of stacked cards, so on a wide
        screen it was a narrow ribbon of content with dead space either side, and
        on a phone the score and streak were separated by three full cards. It is
        now a responsive bento grid: score and streak sit side by side from
        `sm` upward and stack on mobile, and every cell declares its own span so
        the layout cannot overflow.

        `gradient-mesh-animated` supplies the colour, `glass-panel` the surface,
        and both are driven by the theme tokens in `globals.css`, so the design
        follows the light/dark theme instead of hardcoding a palette (A7).
      */}
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />

      <Mount>
        <header className="mb-6 sm:mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Today
              </h1>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full glass-panel px-3.5 py-1.5 text-xs text-muted-foreground shadow-soft sm:text-sm">
                <CalendarIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                {formatInTimeZone(new Date(), timezone, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
        </header>
      </Mount>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-6">
        <div className="lg:col-span-4">
          {/*
            ERROR.md A1: /today showed "Minimum Day" and "Rest Day" but /routine
            has no such entries. They were never day types — the user's day types
            are the `DayTypeDefinition` rows shown here — they were day *modes*
            rendered by a `QuickActions` block that has now been removed, so the
            two screens cannot disagree about what a day can be.
          */}
          <Mount delay={0.06}>
            <TodayDayType date={today} resolvedDayType={resolvedDayType} />
          </Mount>
        </div>

        <div className="lg:col-span-2">
          <Mount delay={0.12}>
            <TodayScore date={today} />
          </Mount>
        </div>

        <div className="lg:col-span-2">
          <Mount delay={0.18}>
            <StreakCard />
          </Mount>
        </div>

        <div className="lg:col-span-4">
          <Mount delay={0.24}>
            <CurrentRoutineBlock />
          </Mount>
        </div>

        <div className="lg:col-span-3">
          <Mount delay={0.3}>
            <TodayHabitChecklist date={today} />
          </Mount>
        </div>

        <div className="lg:col-span-3">
          <Mount delay={0.36}>
            <TodayGoals date={today} />
          </Mount>
        </div>

        <div className="lg:col-span-3">
          <Mount delay={0.42}>
            <TodaySleep date={today} />
          </Mount>
        </div>

        <div className="lg:col-span-3">
          <Mount delay={0.48}>
            <DailyReflection date={today} />
          </Mount>
        </div>
      </div>
    </div>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}