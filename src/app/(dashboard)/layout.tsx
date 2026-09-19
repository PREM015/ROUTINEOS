import { SkipLink } from '@/components/ui/SkipLink';
import { OfflineBanner } from '@/components/offline/OfflineBanner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <SkipLink />
      <OfflineBanner />
      {/* Navigation */}
      <main id="main-content" className="min-h-screen">
        {children}
      </main>
    </div>
  );
}