import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ContributionHeatmap } from '@/components/dashboard/ContributionHeatmap';
import { QuoteDisplay } from '@/components/dashboard/QuoteDisplay';
import { HeaderStrip } from '@/components/dashboard/HeaderStrip';
import { ContextStrip } from '@/components/dashboard/ContextStrip';
import { MomentumPanel } from '@/components/dashboard/MomentumPanel';
import { LifeBalanceRadar } from '@/components/dashboard/LifeBalanceRadar';
import { DayTypePerformance } from '@/components/dashboard/DayTypePerformance';
import { HabitHealthWidget } from '@/components/dashboard/HabitHealthWidget';
import { RoutineAdherence } from '@/components/dashboard/RoutineAdherence';
import { WeeklyRecap } from '@/components/dashboard/WeeklyRecap';
import { GoalsVelocity } from '@/components/dashboard/GoalsVelocity';
import { AchievementsShowcase } from '@/components/achievements/AchievementsShowcase';
import { InsightOfTheDay } from '@/components/dashboard/InsightOfTheDay';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { WidgetGate } from '@/components/dashboard/DashboardWidgets';
import { AdaptiveColumns } from '@/components/dashboard-ui';
import { DashboardOverviewProvider } from '@/components/dashboard/useDashboardOverview';
import { getTodayString, DEFAULT_TZ } from '@/lib/dates';
import { UserRepository } from '@/server/repositories/user.repository';
import { Mount } from '@/components/motion/Mount';
import {
  Activity,
  BarChart3,
  BookOpen,
  Calendar,
  CheckSquare,
  Target,
  Timer,
  Trophy,
} from 'lucide-react';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const features = [
    { name: 'Today Checklist', href: '/today', icon: CheckSquare, desc: "Log today's habits & routine", color: 'text-emerald-400 bg-emerald-500/10' },
    { name: 'Habits Tracker', href: '/habits', icon: Activity, desc: 'Manage tiered habits & schedules', color: 'text-primary bg-primary/10' },
    { name: 'Routine Schedule', href: '/routine', icon: Calendar, desc: 'Time-block your day', color: 'text-purple-400 bg-purple-500/10' },
    { name: 'Goals & Milestones', href: '/goals', icon: Target, desc: 'Set and track key goals', color: 'text-rose-400 bg-rose-500/10' },
    { name: 'Focus Mode', href: '/focus', icon: Timer, desc: 'Pomodoro & deep work timer', color: 'text-amber-400 bg-amber-500/10' },
    { name: 'Daily Journal', href: '/journal', icon: BookOpen, desc: 'Reflections & daily notes', color: 'text-cyan-400 bg-cyan-500/10' },
    { name: 'Analytics', href: '/analytics', icon: BarChart3, desc: 'Performance & habit trends', color: 'text-indigo-400 bg-indigo-500/10' },
    { name: 'Achievements', href: '/achievements', icon: Trophy, desc: 'Milestones & badges', color: 'text-yellow-400 bg-yellow-500/10' },
  ];

  const userTimezone =
    (await new UserRepository().getSettings(session.user.id))?.timezone || DEFAULT_TZ;
  const today = getTodayString(userTimezone);

  /**
   * The day type's name, resolved on the server.
   *
   * A server-resolved value means the header pill is correct on first paint.
   * `/api/day-mode` also returns it, but only after a round trip, which is why
   * the pill used to be able to briefly disagree with itself - a skeleton badge
   * next to an already-known name.
   *
   * It is read-only here by design. `/today` owns the one editable surface for
   * day type in the whole app; a second picker is how two components end up
   * disagreeing about what kind of day it is.
   */
  const resolvedDayTypeName = await (async () => {
    try {
      const { resolveDayTypeForDate } = await import('@/lib/scheduling/resolve-routine');
      const resolved = await resolveDayTypeForDate(session.user.id, today);
      return resolved.dayTypeName ?? null;
    } catch {
      return null;
    }
  })();

  return (
    /*
      The aurora mesh (A2) and the film grain (A6) sit behind everything, at
      `-z-10` so the glass cards in front of them composite over it rather than
      the mesh painting over the cards.
    */
    <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div
        className="gradient-mesh-animated pointer-events-none absolute inset-0 -z-10 opacity-60"
        aria-hidden="true"
      />
      <div className="noise-overlay pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      {/*
        One provider, one request, six widgets.

        Every trend-shaped card below - Momentum, radar, day types, adherence,
        recap, goals - is a function of the same trailing window. Without this
        provider each would fetch it separately, which is exactly the duplicated
        polling the audit recorded, and which lets two cards compute the same
        number two different ways.
      */}
      <DashboardOverviewProvider>
        <div className="space-y-6">
          {/* HEADER: mini strip + read-only day-type pill. */}
          <Mount>
            <HeaderStrip dayTypeName={resolvedDayTypeName} />
          </Mount>

          {/* CONTEXT STRIP: weekly verdict + the right-now chip. */}
          <Mount delay={0.06}>
            <ContextStrip dayTypeName={resolvedDayTypeName} />
          </Mount>

          {/* Quote of the day. */}
          <Mount delay={0.1}>
            <WidgetGate widgetKey="quotes">
              <QuoteDisplay />
            </WidgetGate>
          </Mount>

          {/* FEATURE HUB: navigation only, never gated. */}
          <Mount delay={0.14}>
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Feature hub
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <a
                      key={feature.href}
                      href={feature.href}
                      className="glass-panel glass-panel-lift spotlight-hover flex flex-col items-center justify-center rounded-xl p-3 text-center shadow-soft transition-transform duration-300 ease-out-expo group"
                    >
                      <div className={`mb-2 rounded-lg p-2.5 transition-transform group-hover:scale-110 ${feature.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="w-full truncate text-xs font-semibold text-foreground">
                        {feature.name}
                      </span>
                      {/*
                        `desc` was declared for all eight features and never
                        rendered, which is not enough to tell "Goals & Milestones"
                        from "Achievements" at a glance. Shown from `sm:` up, where
                        there is room, and dropped below that so the 2-up mobile
                        grid stays compact.
                      */}
                      <span className="mt-0.5 hidden w-full text-[10px] leading-tight text-muted-foreground sm:block">
                        {feature.desc}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </Mount>

          {/*
            THE HERO. Momentum is the page's gravitational centre and the only
            card allowed the magnetic micro-tilt (B1), so it sits above the fold
            and spans the full width.
          */}
          <Mount delay={0.18}>
            <MomentumPanel />
          </Mount>

          {/*
            `sm:` and `md:` are both present deliberately. Without `md`, the
            768-1023px band - iPad portrait, the single most common tablet width -
            collapses to one very wide column and pushes the right-hand stack
            below the entire left column. `/today` had already fixed this exact gap.

            The right column holds four independently-gated widgets, so it is given
            the list of keys rather than one: collapsing it because a single widget
            is off would hide the other three with it.
          */}
          <AdaptiveColumns
            rightKeys={['insights', 'recap', 'goalsVelocity', 'quickActions']}
            rightLabel="Insights and recaps"
            left={
              <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                <WidgetGate widgetKey="heatmap">
                  <ContributionHeatmap />
                </WidgetGate>

                <WidgetGate widgetKey="radar">
                  <LifeBalanceRadar />
                </WidgetGate>

                <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
                  <WidgetGate widgetKey="dayTypes">
                    <DayTypePerformance />
                  </WidgetGate>

                  <WidgetGate widgetKey="adherence">
                    <RoutineAdherence />
                  </WidgetGate>
                </div>

                {/*
                  Habit health moved to the second row, beside Achievements. It is
                  still the ONLY habits surface on this page - the Habits metric
                  card is gone, so there is no second "due today" definition for it
                  to disagree with (audit F6 / 17.3).
                */}
              </div>
            }
            right={
              <div className="space-y-4 sm:space-y-5 lg:space-y-6">
                <WidgetGate widgetKey="insights">
                  <InsightOfTheDay />
                </WidgetGate>

                <WidgetGate widgetKey="recap">
                  <WeeklyRecap />
                </WidgetGate>

                <WidgetGate widgetKey="goalsVelocity">
                  <GoalsVelocity />
                </WidgetGate>

                <WidgetGate widgetKey="quickActions">
                  <QuickActions />
                </WidgetGate>
              </div>
            }
            secondLeft={
              <WidgetGate widgetKey="habitHealth">
                <HabitHealthWidget />
              </WidgetGate>
            }
            secondRight={
              /*
                `widgetKey` stays `achievements` so a user's existing preference
                keeps working; only the component behind it and its position
                changed. It is a scrollable rail rather than a full-bleed grid
                because the full-bleed version spent the whole page width and a
                lot of vertical scroll on a dozen badges.
              */
              <WidgetGate widgetKey="achievements">
                <AchievementsShowcase />
              </WidgetGate>
            }
            secondRightKeys={['achievements']}
          />
        </div>
      </DashboardOverviewProvider>
    </div>
  );
}
