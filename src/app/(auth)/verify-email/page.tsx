'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { AuthCard } from '@/components/auth/AuthCard';

/**
 * Email verification page.
 *
 * Client component that reads the `token` query parameter, verifies it through
 * `POST /api/auth/verify-email`, and shows the appropriate success or failure
 * state with a path forward.
 */

interface VerifyEmailResult {
  success: boolean;
  message: string;
}

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email address...');

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('Missing verification token. Use the link from your email.');
        return;
      }

      try {
        const result = await apiRequest<VerifyEmailResult>('/api/auth/verify-email', {
          method: 'POST',
          body: { token },
        });
        if (!cancelled) {
          setStatus('success');
          setMessage(result.message ?? 'Email verified successfully');
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Failed to verify email');
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthCard className="text-center">
      <div className="flex justify-center mb-6">
        <div
          className={
            status === 'success'
              ? 'p-3 bg-emerald-500/10 rounded-full'
              : status === 'error'
                ? 'p-3 bg-destructive/10 rounded-full'
                : 'p-3 bg-primary/20 rounded-full'
          }
        >
          {status === 'verifying' ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-8 h-8 text-destructive" />
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-center text-foreground mb-2">
        {status === 'verifying'
          ? 'Verifying Email'
          : status === 'success'
            ? 'Email Verified'
            : 'Verification Failed'}
      </h1>
      <p className="text-center text-muted-foreground mb-8">{message}</p>

      {status === 'success' && (
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
        >
          Sign In
        </Link>
      )}
      {status === 'error' && (
        <Link
          href="/resend-verification"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
        >
          Resend Verification Email
        </Link>
      )}
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthCard className="text-center">
          <p className="text-muted-foreground animate-pulse">Verifying your email address...</p>
        </AuthCard>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}