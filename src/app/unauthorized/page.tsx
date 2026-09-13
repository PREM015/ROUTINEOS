import Link from 'next/link';

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-neutral-100">
      <p className="text-sm font-medium tracking-wide text-neutral-500">403</p>
      <h1 className="text-2xl font-semibold">You don't have access to this page</h1>
      <p className="max-w-sm text-sm text-neutral-400">
        This area is restricted. If you think this is a mistake, contact the account owner.
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
