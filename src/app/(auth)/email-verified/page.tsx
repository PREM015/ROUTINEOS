import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';

/**
 * Email verified landing page.
 *
 * Server component shown after a successful email verification. Confirms the
 * account is active and directs the user to sign in.
 */

export const metadata = {
  title: 'Email Verified | RoutineOS',
  description: 'Your email has been verified successfully.',
};

export default function EmailVerifiedPage() {
  return (
    <AuthCard className="text-center">
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-emerald-500/10 rounded-full">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Email Verified</h1>
      <p className="text-center text-muted-foreground mb-8">
        Your email address has been verified successfully. You can now sign in
        and start building better routines.
      </p>

      <Link
        href="/login"
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
      >
        Sign In
      </Link>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to RoutineOS?{' '}
        <Link href="/register" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}