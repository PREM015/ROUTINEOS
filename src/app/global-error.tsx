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
        <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-zinc-950 text-white">
          <div className="max-w-md w-full space-y-6 text-center">
            {/* Error Icon */}
            <div className="flex justify-center">
              <svg 
                className="w-20 h-20 text-red-500" 
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

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-zinc-100">
                Something went wrong!
              </h2>
              <p className="text-zinc-400">
                We've been notified and are working on a fix. Please try again.
              </p>
            </div>

            {/* Error ID */}
            {error.digest && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">Error ID</p>
                <p className="text-xs text-zinc-400 font-mono break-all">
                  {error.digest}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={reset}
                className="w-full px-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition"
              >
                Try again
              </button>
              <Link
                href="/"
                className="w-full px-4 py-3 border border-zinc-700 text-zinc-300 font-medium rounded-lg hover:border-zinc-500 hover:bg-zinc-900 transition text-center"
              >
                Go to Home
              </Link>
            </div>

            {/* Support Link */}
            <p className="text-xs text-zinc-600">
              Need help?{' '}
              <a 
                href="/feedback" 
                className="text-zinc-400 hover:text-zinc-200 underline"
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