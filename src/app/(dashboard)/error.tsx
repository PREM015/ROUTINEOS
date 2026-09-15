'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';
import { useSession } from 'next-auth/react';
import { AlertCircle, Home, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    // Report error to monitoring service
    ErrorReporter.reportClientError(error, session?.user?.id, {
      digest: error.digest,
      type: 'dashboard-error',
      page: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
    
    // Log to console in development
    console.error('Dashboard error:', error);
  }, [error, session?.user?.id]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
      {/* Error Icon */}
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10">
        <AlertCircle className="w-8 h-8 text-red-500" />
      </div>

      {/* Error Content */}
      <div className="space-y-2 max-w-md">
        <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Something went wrong
        </p>
        <h1 className="text-2xl font-semibold text-zinc-100">
          This page encountered an error
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Your data is safe — this was just a rendering issue. Try refreshing the page,
          or head back to your dashboard.
        </p>
      </div>

      {/* Error ID */}
      {error.digest && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2">
          <p className="text-xs text-zinc-500 mb-1">Error ID</p>
          <p className="text-xs text-zinc-400 font-mono">
            {error.digest}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-300"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900"
        >
          <Home className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>

      {/* Development Error Details */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-8 w-full max-w-2xl">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">
            Show error details (dev only)
          </summary>
          <div className="mt-4 rounded-lg bg-zinc-900 border border-zinc-800 p-4 text-left">
            <pre className="text-xs text-red-400 overflow-auto">
              {error.message}
              {'\n\n'}
              {error.stack}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}