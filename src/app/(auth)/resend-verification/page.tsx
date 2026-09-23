'use client';

import Link from 'next/link';
import { MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { AuthCard, AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

/**
 * Resend verification email page.
 *
 * Client component that asks for the account email and triggers a fresh
 * verification email via `POST /api/auth/resend-verification`.
 */

interface ResendVerificationResult {
  success: boolean;
  message: string;
}

export default function ResendVerificationPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
      const result = await apiRequest<ResendVerificationResult>(
        '/api/auth/resend-verification',
        {
          method: 'POST',
          body: { email },
        }
      );
      setSuccess(result.message ?? 'Verification email sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          {success ? (
            <MailCheck className="w-8 h-8 text-primary" />
          ) : (
            <Send className="w-8 h-8 text-primary" />
          )}
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Resend Verification</h1>
      <p className="text-center text-muted-foreground mb-8">
        We&apos;ll send a new verification link to your inbox
      </p>

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm text-center">
          {success}
        </div>
      )}

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
          Send Verification Email
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to Sign In
        </Link>
      </p>
    </AuthCard>
  );
}