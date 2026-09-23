'use client';

import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { AuthCard, AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

/**
 * Verify two-factor code page.
 *
 * Client component that collects a 6-digit code and verifies it through
 * `POST /api/auth/2fa/verify`; on success it refreshes the session via
 * `useAuth().init()` and redirects to the dashboard.
 */

interface TwoFactorVerifyResult {
  success: boolean;
  message: string;
}

export default function VerifyTwoFactorPage() {
  const { init } = useAuth();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code)) {
      setError('Please enter the 6-digit code from your authenticator app');
      return;
    }

    setLoading(true);
    try {
      await apiRequest<TwoFactorVerifyResult>('/api/auth/2fa/verify', {
        method: 'POST',
        body: { code },
      });
      await init();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Two-Factor Verification</h1>
      <p className="text-center text-muted-foreground mb-8">
        Enter the 6-digit code from your authenticator app
      </p>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
            className={`${AUTH_INPUT_CLASS} text-center tracking-[0.5em] text-lg`}
            placeholder="••••••"
            aria-label="6-digit verification code"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive text-center">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" isLoading={loading} className="w-full mt-4">
          Verify & Continue
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Can&apos;t sign in?{' '}
        <a href="mailto:support@routineos.com" className="text-primary hover:underline">
          Contact support
        </a>
      </p>
    </AuthCard>
  );
}