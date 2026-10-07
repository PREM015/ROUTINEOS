import { SkipLink } from '@/components/ui/SkipLink';
import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { OfflineSync } from '@/components/offline/OfflineSync';
import { DataErrorBanner } from '@/components/layout/DataErrorBanner';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileNav } from '@/components/layout/MobileNav';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { SleepPromptHost } from '@/components/shared/SleepPromptHost';
import { FloatingFocusBar } from '@/components/focus/FloatingFocusBar';
import { FocusRuntime } from '@/components/focus/FocusRuntime';
import { CelebrationHost } from '@/components/achievements/CelebrationHost';
import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';

/**
 * The entire authenticated application — 68 routes, every one of them behind a
 * session.
 *
 * These pages were `index, follow` with no robots directive anywhere in the
 * repo. Because `src/proxy.ts` redirects unauthenticated requests to `/login`,
 * a crawler discovered all 68 URLs and every one resolved to the same sign-in
 * form. That is the classic duplicate-content pattern: it diluted the pages
 * that *should* rank, and it put internal navigation such as `/settings/api-keys`
 * or `/admin/users` into a public index.
 *
 * Declaring `noindex` here rather than in 68 individual pages means the
 * directive applies to every current and future route in the group, and cannot
 * be forgotten when someone adds a page.
 *
 * `robots.ts` deliberately does *not* disallow these paths. A URL that is
 * blocked from crawling cannot be confirmed as `noindex`, so blocking and
 * `noindex` conflict; the metadata is the layer that actually works.
 */
export const metadata: Metadata = privateMetadata('RoutineOS');

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <SkipLink />
      <OfflineSync />
      <OfflineBanner />
      {/* Owns the focus session lifecycle for every page in the group.
          In the layout rather than on `/focus` because the previous design put the
          clock inside the page: navigating away unmounted the component that owned
          it, so the floating bar froze at 00:00 and its Pause/Resume/Stop buttons —
          which were closures over that unmounted component's state — silently did
          nothing. A runtime in the layout cannot be unmounted by navigating. */}
      <FocusRuntime />
      {/* Surfaces AppContext.dataError, which was previously set but never read
          anywhere — a failed shared fetch looked like an empty dataset. */}
      <DataErrorBanner className="fixed inset-x-0 top-0 z-50" />

      {/* Desktop Sidebar Navigation */}
      <Sidebar />

      {/* Content Area with Header, Main, and Footer */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main id="main-content" className="flex-1 pb-20 md:pb-8">
          {children}
        </main>

        <Footer />
        <MobileNav />
        {/* Slide-in nav drawer for phones: same destinations as the desktop
            Sidebar, opened by the header hamburger or the bottom bar's "More". */}
        <MobileMenu />
        <FloatingFocusBar />
        <CelebrationHost />
        <SleepPromptHost />
      </div>
    </div>
  );
}