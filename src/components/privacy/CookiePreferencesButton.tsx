'use client';

import { useConsentStore } from '@/store/consent.store';
import { cn } from '@/lib/utils';

/**
 * Reopens the consent preferences dialog.
 *
 * Required for the consent to be *withdrawable*. A banner that can only be
 * answered once is not an ongoing choice: GDPR and similar regimes treat
 * consent as withdrawable at any time, and the user needs a persistent way to
 * reach it after the first-visit banner is gone. Surfaced in the site footer
 * and on the privacy settings page.
 *
 * Renders a `<button>` rather than a link because it opens a dialog; it is
 * styled to sit inline with footer links so the two do not look different.
 */
export function CookiePreferencesButton({
  className,
  children = 'Cookie preferences',
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const openPreferences = useConsentStore((s) => s.openPreferences);

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={cn(
        'transition-all duration-300 ease-out-expo hover:text-primary hover:translate-x-0.5',
        className
      )}
    >
      {children}
    </button>
  );
}
