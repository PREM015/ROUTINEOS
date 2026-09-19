import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ContributionHeatmap } from '@/components/dashboard/ContributionHeatmap';
import { ProgressRings } from '@/components/dashboard/ProgressRings';
import { WeeklyBarChart } from '@/components/dashboard/WeeklyBarChart';
import { StreakWidget } from '@/components/dashboard/StreakWidget';
import { GoalsWidget } from '@/components/dashboard/GoalsWidget';
import { CoreScoreWidget } from '@/components/dashboard/CoreScoreWidget';
import { SleepWidget } from '@/components/dashboard/SleepWidget';
import { HabitHealthWidget } from '@/components/dashboard/HabitHealthWidget';
import { InsightWidget } from '@/components/dashboard/InsightWidget';
import { QuoteDisplay } from '@/components/dashboard/QuoteDisplay';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600">Your productivity overview</p>
      </div>

      {/* Quote of the Day */}
      <QuoteDisplay />

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <CoreScoreWidget />
        <StreakWidget />
        <GoalsWidget />
        <SleepWidget />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contribution Heatmap */}
          <ContributionHeatmap />

          {/* Weekly Progress */}
          <WeeklyBarChart />

          {/* Habit Health */}
          <HabitHealthWidget />
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          {/* Progress Rings */}
          <ProgressRings />

          {/* AI Insights */}
          <InsightWidget />
        </div>
      </div>
    </div>
  );
}