'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { AuthCard, AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

/**
 * Reset password page.
 *
 * Client component that reads the one-time token from the URL, validates it
 * against `POST /api/auth/check-reset-token`, then collects a new password and
 * submits it to `POST /api/auth/reset-password`.
 */

interface CheckResetTokenResult {
  valid: boolean;
}

interface ResetPasswordResult {
  success: boolean;
  message: string;
}

function LoadingCard() {
  return (
    <AuthCard className="text-center">
      <p className="text-muted-foreground animate-pulse">Checking reset link...</p>
    </AuthCard>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [tokenState, setTokenState] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkToken = async () => {
      if (!token) {
        setTokenState('invalid');
        return;
      }
      try {
        const result = await apiRequest<CheckResetTokenResult>('/api/auth/check-reset-token', {
          method: 'POST',
          body: { token },
        });
        if (!cancelled) setTokenState(result.valid ? 'valid' : 'invalid');
      } catch {
        if (!cancelled) setTokenState('invalid');
      }
    };

    void checkToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      next.password = 'Password must contain an uppercase letter';
    } else if (!/[0-9]/.test(password)) {
      next.password = 'Password must contain a number';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const result = await apiRequest<ResetPasswordResult>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password, confirmPassword },
      });
      setSuccess(result.message ?? 'Password has been reset');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (tokenState === 'checking') {
    return <LoadingCard />;
  }

  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          {success ? (
            <CheckCircle2 className="w-8 h-8 text-primary" />
          ) : (
            <KeyRound className="w-8 h-8 text-primary" />
          )}
        </div>
      </div>

      {tokenState === 'invalid' ? (
        <>
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">Invalid Reset Link</h1>
          <p className="text-center text-muted-foreground mb-8">
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
          >
            Request a New Link
          </Link>
        </>
      ) : success ? (
        <>
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">Password Reset</h1>
          <p className="text-center text-muted-foreground mb-8">
            {success}. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
          >
            Go to Sign In
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">Reset Password</h1>
          <p className="text-center text-muted-foreground mb-8">
            Choose a new password for your account
          </p>

          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">New Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={cn(
                  AUTH_INPUT_CLASS,
                  fieldErrors.password && 'border-destructive focus:border-destructive focus:ring-destructive'
                )}
                placeholder="At least 8 characters"
              />
              {fieldErrors.password && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={cn(
                  AUTH_INPUT_CLASS,
                  fieldErrors.confirmPassword && 'border-destructive focus:border-destructive focus:ring-destructive'
                )}
                placeholder="Re-enter new password"
              />
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-sm text-destructive">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive text-center">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" isLoading={loading} className="w-full mt-4">
              Reset Password
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              Back to Sign In
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <ResetPasswordForm />
    </Suspense>
  );
}