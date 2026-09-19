'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-center"
    >
      <div className="flex justify-center mb-6">
        <div
          className={
            status === 'success'
              ? 'p-3 bg-emerald-500/20 rounded-full'
              : status === 'error'
                ? 'p-3 bg-red-500/20 rounded-full'
                : 'p-3 bg-primary/20 rounded-full'
          }
        >
          {status === 'verifying' ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          ) : (
            <AlertCircle className="w-8 h-8 text-red-400" />
          )}
        </div>
      </div>

      <h1 className="text-2xl font-bold text-center text-white mb-2">
        {status === 'verifying'
          ? 'Verifying Email'
          : status === 'success'
            ? 'Email Verified'
            : 'Verification Failed'}
      </h1>
      <p className="text-center text-white/60 mb-8">{message}</p>

      {status === 'success' && (
        <Link
          href="/login"
          className="block w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-center"
        >
          Sign In
        </Link>
      )}
      {status === 'error' && (
        <Link
          href="/resend-verification"
          className="block w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-center"
        >
          Resend Verification Email
        </Link>
      )}
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl text-center">
          <p className="text-white/60 animate-pulse">Verifying your email address...</p>
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}