"use client";

import { CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function DashboardStep() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center space-y-6 text-center">
      <div className="glass-panel glow-primary p-4 rounded-full">
        <CheckCircle className="w-16 h-16 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-3xl font-bold">You&apos;re all set!</h2>
      <p className="max-w-md text-muted-foreground">
        Your RoutineOS is configured. You can tweak these settings anytime from your dashboard. Let&apos;s make today great.
      </p>

      <Button onClick={() => router.push('/dashboard')} size="lg" className="mt-8">
        Go to Dashboard
      </Button>
    </div>
  );
}