'use client';

import Link from 'next/link';
import { MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { AuthCard, AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

/**
 * Forgot password page.
 *
 * Client component that collects an email address and requests a password
 * reset link via `POST /api/auth/forgot-password`. Always shows a generic
 * "check your email" success message so we never reveal whether an account
 * exists.
 */

interface ForgotPasswordResult {
  success: boolean;
  message: string;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ForgotPasswordResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest<ForgotPasswordResult>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: { email },
        }
      );
      setSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthCard className="text-center">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-primary/20 rounded-full">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-foreground mb-2">Check your email</h1>
        <p className="text-center text-muted-foreground mb-8">
          {success.message}
        </p>
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
        >
          Back to Sign In
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <Send className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Forgot Password</h1>
      <p className="text-center text-muted-foreground mb-8">
        Enter your email and we&apos;ll send you a reset link
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={AUTH_INPUT_CLASS}
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive text-center">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" isLoading={loading} className="w-full mt-4">
          Send Reset Link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered your password?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Sign In
        </Link>
      </p>
    </AuthCard>
  );
}