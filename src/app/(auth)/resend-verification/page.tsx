'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
    >
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          {success ? (
            <MailCheck className="w-8 h-8 text-primary" />
          ) : (
            <Send className="w-8 h-8 text-primary" />
          )}
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Resend Verification</h1>
      <p className="text-center text-white/60 mb-8">
        We&apos;ll send a new verification link to your inbox
      </p>

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm text-center">
          {success}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder="you@example.com"
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
          {loading ? 'Sending...' : 'Send Verification Email'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        <Link href="/login" className="text-primary hover:underline">
          Back to Sign In
        </Link>
      </p>
    </motion.div>
  );
}