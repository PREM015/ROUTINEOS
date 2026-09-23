import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ContributionHeatmap } from '@/components/dashboard/ContributionHeatmap';
import { WeeklyBarChart } from '@/components/dashboard/WeeklyBarChart';
import StreakWidget from '@/components/dashboard/StreakWidget';
import GoalsWidget from '@/components/dashboard/GoalsWidget';
import { CoreScoreWidget } from '@/components/dashboard/CoreScoreWidget';
import { SleepWidget } from '@/components/dashboard/SleepWidget';
import { HabitHealthWidget } from '@/components/dashboard/HabitHealthWidget';
import { InsightWidget } from '@/components/dashboard/InsightWidget';
import { QuoteDisplay } from '@/components/dashboard/QuoteDisplay';
import { RoutineWidget } from '@/components/dashboard/RoutineWidget';
import { Mount } from '@/components/motion/Mount';
import {
  Activity,
  Calendar,
  CheckSquare,
  Target,
  Timer,
  BookOpen,
  BarChart3,
  Trophy,
  ArrowRight,
} from 'lucide-react';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const features = [
    { name: 'Today Checklist', href: '/today', icon: CheckSquare, desc: "Log today's habits & routine", color: 'text-emerald-400 bg-emerald-500/10' },
    { name: 'Habits Tracker', href: '/habits', icon: Activity, desc: 'Manage tiered habits & schedules', color: 'text-blue-400 bg-blue-500/10' },
    { name: 'Routine Schedule', href: '/routine', icon: Calendar, desc: 'Time-block your day', color: 'text-purple-400 bg-purple-500/10' },
    { name: 'Goals & Milestones', href: '/goals', icon: Target, desc: 'Set and track key goals', color: 'text-rose-400 bg-rose-500/10' },
    { name: 'Focus Mode', href: '/focus', icon: Timer, desc: 'Pomodoro & deep work timer', color: 'text-amber-400 bg-amber-500/10' },
    { name: 'Daily Journal', href: '/journal', icon: BookOpen, desc: 'Reflections & daily notes', color: 'text-cyan-400 bg-cyan-500/10' },
    { name: 'Analytics', href: '/analytics', icon: BarChart3, desc: 'Performance & habit trends', color: 'text-indigo-400 bg-indigo-500/10' },
    { name: 'Achievements', href: '/achievements', icon: Trophy, desc: 'Milestones & badges', color: 'text-yellow-400 bg-yellow-500/10' },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
      {/* Header Banner */}
      <Mount>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {session.user.name || 'User'} 👋
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Here is your daily productivity overview and performance insights.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/today"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 transition-opacity text-sm shadow-sm"
            >
              Go to Today
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </Mount>

      {/* Quote of the Day */}
      <Mount delay={0.08}>
        <QuoteDisplay />
      </Mount>

      {/* Feature Quick Launch Bar */}
      <Mount delay={0.16}>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Feature Hub
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link
                  key={feature.href}
                  href={feature.href}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-muted/50 hover:-translate-y-0.5 transition-all duration-300 ease-out-expo text-center group"
                >
                  <div className={`p-2.5 rounded-lg ${feature.color} mb-2 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-semibold text-foreground truncate w-full">
                    {feature.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </Mount>

      {/* Top Stats Overview */}
      <Mount delay={0.24}>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Metrics & Momentum
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
            <Mount delay={0.26}><CoreScoreWidget /></Mount>
            <Mount delay={0.3}><StreakWidget /></Mount>
            <Mount delay={0.34}><GoalsWidget /></Mount>
            <Mount delay={0.38}><SleepWidget /></Mount>
          </div>
        </div>
      </Mount>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6 min-w-0 min-h-0">
          {/* Routine Blocks Progress */}
          <Mount delay={0.42}><RoutineWidget /></Mount>

          {/* Contribution Heatmap */}
          <Mount delay={0.48}><ContributionHeatmap /></Mount>

          {/* Weekly Progress */}
          <Mount delay={0.54}><WeeklyBarChart /></Mount>

          {/* Habit Health */}
          <Mount delay={0.6}><HabitHealthWidget /></Mount>
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          {/* AI Insights */}
          <Mount delay={0.44}><InsightWidget /></Mount>
        </div>
      </div>
    </div>
  );
}