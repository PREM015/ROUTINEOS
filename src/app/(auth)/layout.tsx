import { ReactNode } from 'react';
import type { Metadata } from 'next';
import { privateMetadata } from '@/lib/seo';

/**
 * Every page in this group is a credential or token-handling screen: sign-in,
 * sign-up, password reset, email verification, two-factor enrolment. None of
 * them are content, and all of them inherit the same form inputs and error
 * text.
 *
 * They were previously inheriting the root layout's `index, follow` with no
 * override, so `/login` and `/register` were indexable. That is worse than
 * merely wasteful: a search result for the sign-in page is a low-value,
 * high-bounce SERP entry, and indexed reset/verification URLs invite
 * enumeration of token endpoints by crawlers.
 *
 * Declaring it once here covers the whole group, including any page added
 * later.
 */
export const metadata: Metadata = privateMetadata('RoutineOS');

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Background Gradient */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="gradient-mesh-animated absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />
      </div>
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none dark:bg-teal-500/20" />

      <div className="relative z-10 w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
