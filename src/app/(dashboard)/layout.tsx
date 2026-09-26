import { SkipLink } from '@/components/ui/SkipLink';
import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileNav } from '@/components/layout/MobileNav';
import { SleepPromptHost } from '@/components/shared/SleepPromptHost';
import { FloatingFocusBar } from '@/components/focus/FloatingFocusBar';
import { CelebrationHost } from '@/components/achievements/CelebrationHost';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <SkipLink />
      <OfflineBanner />

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
        <FloatingFocusBar />
        <CelebrationHost />
        <SleepPromptHost />
      </div>
    </div>
  );
}