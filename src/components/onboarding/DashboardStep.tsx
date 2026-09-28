"use client";

import { CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

/**
 * Final onboarding step.
 *
 * Shows what was actually created rather than asserting "You're all set!" —
 * the wizard previously claimed success while persisting nothing at all.
 */
export function DashboardStep({
  appliedSummary,
  error,
  saving,
  onFinish,
}: {
  appliedSummary: string[];
  error: string | null;
  saving: boolean;
  onFinish: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center space-y-6 text-center">
      <div className="glass-panel glow-primary p-4 rounded-full">
        <CheckCircle2 className="w-16 h-16 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-3xl font-bold">You&apos;re all set!</h2>

      {appliedSummary.length > 0 ? (
        <div className="max-w-md">
          <p className="text-muted-foreground">We set up:</p>
          <ul className="mt-3 space-y-1 text-sm text-foreground">
            {appliedSummary.map((item) => (
              <li key={item}>✓ {item}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            You can tweak any of these from Settings at any time.
          </p>
        </div>
      ) : (
        <p className="max-w-md text-muted-foreground">
          You skipped the optional setup. Everything can be added later from
          Settings — let&apos;s make today great.
        </p>
      )}

      {error && (
        <p className="max-w-md text-sm text-destructive" role="status">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {!saving && !error && (
          <Button variant="outline" onClick={onFinish} isLoading={saving}>
            Finish setup
          </Button>
        )}
        <Button onClick={() => router.push('/dashboard')} size="lg">
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
