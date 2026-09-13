import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-neutral-100">
      <p className="text-sm font-medium tracking-wide text-neutral-500">404</p>
      <h1 className="text-2xl font-semibold">This page doesn't exist</h1>
      <p className="max-w-sm text-sm text-neutral-400">
        The page you're looking for was moved, renamed, or never existed. Let's get you back to your routine.
      </p>
      <Link
        href="/today"
        className="mt-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-300"
      >
        Back to Today
      </Link>
    </div>
  );
}
