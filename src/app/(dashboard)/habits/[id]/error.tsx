'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function HabitDetailError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error('[HabitDetail] Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 border border-destructive/30">
        <AlertTriangle size={24} className="text-destructive" />
      </div>

      <h2 className="text-lg font-semibold text-foreground mb-2">Failed to load habit</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        {error.message || 'Something went wrong while loading this habit. Try refreshing.'}
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={15} />
          Go back
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground transition-colors"
        >
          <RefreshCw size={15} />
          Try again
        </button>
      </div>
    </div>
  );
}
