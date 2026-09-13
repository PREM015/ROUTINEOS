'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">Something went badly wrong</h1>
          <p className="max-w-sm text-sm text-neutral-400">
            The app hit an unexpected error and couldn't recover on its own.
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-300"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
