'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
    >
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <ShieldCheck className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Two-Factor Verification</h1>
      <p className="text-center text-white/60 mb-8">
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
            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-center tracking-[0.5em] text-lg"
            placeholder="••••••"
            aria-label="6-digit verification code"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400 text-center">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 mt-4"
        >
          {loading ? 'Verifying...' : 'Verify & Continue'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        Can&apos;t sign in?{' '}
        <a href="mailto:support@routineos.com" className="text-primary hover:underline">
          Contact support
        </a>
      </p>
    </motion.div>
  );
}