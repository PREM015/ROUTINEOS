'use client';

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium tracking-wide text-neutral-500">Something went wrong</p>
      <h1 className="text-xl font-semibold text-neutral-100">This page hit an error</h1>
      <p className="max-w-sm text-sm text-neutral-400">
        Your data is safe — this was just a rendering issue. Try again, or head back to Today.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-300"
        >
          Try again
        </button>
        <a
          href="/today"
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-500"
        >
          Back to Today
        </a>
      </div>
    </div>
  );
}
