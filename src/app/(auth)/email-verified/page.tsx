import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

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
    <div className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-center">
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-emerald-500/20 rounded-full">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-center text-white mb-2">Email Verified</h1>
      <p className="text-center text-white/60 mb-8">
        Your email address has been verified successfully. You can now sign in
        and start building better routines.
      </p>

      <Link
        href="/login"
        className="block w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-center"
      >
        Sign In
      </Link>

      <p className="mt-6 text-center text-sm text-white/60">
        New to RoutineOS?{' '}
        <Link href="/register" className="text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}