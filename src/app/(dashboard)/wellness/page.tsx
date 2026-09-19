import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { HeartPulse } from 'lucide-react';
import { WellnessStats } from '@/components/wellness/WellnessStats';
import MoodTracker from '@/components/wellness/MoodTracker';

/**
 * Wellness Page
 * Morning check-in plus a 30-day wellness snapshot (mood, energy, sleep).
 */
export default async function WellnessPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <HeartPulse className="h-7 w-7 text-pink-600" />
          Wellness
        </h1>
        <p className="mt-2 text-gray-600">
          Track how you feel, spot patterns in your energy and sleep, and act on the insights
          RoutineOS surfaces.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <MoodTracker />
        </div>
        <div className="lg:col-span-2">
          <WellnessStats />
        </div>
      </div>
    </div>
  );
}
