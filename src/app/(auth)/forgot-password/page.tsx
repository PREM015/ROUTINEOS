'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { MailCheck, Send } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';

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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
      >
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-primary/20 rounded-full">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-white mb-2">Check your email</h1>
        <p className="text-center text-white/60 mb-8">
          {success.message}
        </p>
        <Link
          href="/login"
          className="block w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity text-center"
        >
          Back to Sign In
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
    >
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <Send className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Forgot Password</h1>
      <p className="text-center text-white/60 mb-8">
        Enter your email and we&apos;ll send you a reset link
      </p>

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
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        Remembered your password?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Sign In
        </Link>
      </p>
    </motion.div>
  );
}