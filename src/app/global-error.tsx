'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to error monitoring service
    ErrorReporter.reportClientError(error, undefined, {
      digest: error.digest,
      type: 'global-error',
      location: typeof window !== 'undefined' ? window.location.href : undefined,
    });
  }, [error]);

  return (
    <html>
      <body>
        <div className="relative flex flex-col items-center justify-center min-h-screen p-8 bg-background text-foreground overflow-hidden">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="gradient-mesh-animated absolute inset-0" />
            <div className="noise-overlay absolute inset-0" />
          </div>
          <div className="max-w-md w-full space-y-6 text-center relative">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="glass-panel glow-primary flex h-28 w-28 items-center justify-center rounded-3xl p-4">
                <svg 
                  className="w-16 h-16 text-destructive" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
                  />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                Something went wrong!
              </h2>
              <p className="text-muted-foreground">
                We&apos;ve been notified and are working on a fix. Please try again.
              </p>
            </div>

            {/* Error ID */}
            {error.digest && (
              <div className="glass-panel rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Error ID</p>
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {error.digest}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={reset}
                className="light-sweep glow-neon w-full px-4 py-3 bg-primary text-primary-foreground font-medium rounded-lg transition-transform duration-300 ease-out-expo hover:scale-[1.02] active:scale-[0.99]"
              >
                Try again
              </button>
              <Link
                href="/"
                className="shadow-soft w-full px-4 py-3 border border-border text-foreground font-medium rounded-lg hover:border-foreground/30 hover:bg-muted transition text-center"
              >
                Go to Home
              </Link>
            </div>

            {/* Support Link */}
            <p className="text-xs text-muted-foreground/60">
              Need help?{' '}
              <a 
                href="/feedback" 
                className="text-muted-foreground hover:text-foreground underline"
              >
                Contact support
              </a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}