import Link from 'next/link';
import { CloudOff } from 'lucide-react';

/**
 * Offline fallback.
 *
 * This route did not exist, and `public/sw.js` lists `/offline` in its precache
 * manifest. `Cache.addAll()` rejects the entire promise if *any* request is not
 * ok, so the `/offline` 404 made the service worker's `install` event fail. A
 * failed install means the worker never activates, which means
 * `navigator.serviceWorker.ready` never resolves, which means
 * `pushManager.subscribe()` can never be called — so the whole Web Push
 * pipeline was unreachable and no notification could ever be delivered.
 *
 * Because it is precached, this page must render without a network request and
 * must not depend on anything that fetches. It is a server component with no
 * data access and no client hooks.
 */
export const metadata = {
  title: 'Offline · RoutineOS',
  description: 'You are offline. Cached pages are still available.',
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <CloudOff className="h-8 w-8" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          You&rsquo;re offline
        </h1>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          RoutineOS can&rsquo;t reach the network right now. Pages you have already
          visited still work, and anything you change will sync once you are back
          online.
        </p>
      </div>

      <Link
        href="/today"
        className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Go to today
      </Link>
    </main>
  );
}
