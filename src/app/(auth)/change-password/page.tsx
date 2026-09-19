'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Change password page.
 *
 * Client component that lets an authenticated user replace their password
 * after confirming the current one. Delegates to `POST /api/auth/change-password`,
 * then offers a link back to the profile page on success.
 */

interface ChangePasswordResult {
  success: boolean;
  message: string;
}

const inputClasses =
  'w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!currentPassword) {
      next.currentPassword = 'Current password is required';
    }
    if (newPassword.length < 8) {
      next.newPassword = 'New password must be at least 8 characters';
    } else if (!/[A-Z]/.test(newPassword)) {
      next.newPassword = 'New password must contain an uppercase letter';
    } else if (!/[0-9]/.test(newPassword)) {
      next.newPassword = 'New password must contain a number';
    }
    if (newPassword && newPassword === currentPassword) {
      next.newPassword = 'New password must be different from the current password';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
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
      const result = await apiRequest<ChangePasswordResult>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: {
            currentPassword,
            newPassword,
            confirmPassword,
          },
        }
      );
      setSuccess(result.message ?? 'Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
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
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Change Password</h1>
      <p className="text-center text-white/60 mb-8">Update your account password</p>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Current Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className={cn(
              inputClasses,
              fieldErrors.currentPassword && 'border-red-500/60 focus:border-red-500 focus:ring-red-500'
            )}
            placeholder="••••••••"
          />
          {fieldErrors.currentPassword && (
            <p className="mt-1 text-sm text-red-400">{fieldErrors.currentPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">New Password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className={cn(
              inputClasses,
              fieldErrors.newPassword && 'border-red-500/60 focus:border-red-500 focus:ring-red-500'
            )}
            placeholder="At least 8 characters"
          />
          {fieldErrors.newPassword && (
            <p className="mt-1 text-sm text-red-400">{fieldErrors.newPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Confirm New Password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={cn(
              inputClasses,
              fieldErrors.confirmPassword && 'border-red-500/60 focus:border-red-500 focus:ring-red-500'
            )}
            placeholder="Re-enter new password"
          />
          {fieldErrors.confirmPassword && (
            <p className="mt-1 text-sm text-red-400">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400 text-center">
            {error}
          </p>
        )}
        {success && (
          <div className="flex items-start gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {success}.{' '}
              <Link href="/profile" className="text-primary hover:underline">
                Back to profile
              </Link>
            </span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 mt-4"
        >
          {loading ? 'Changing password...' : 'Change Password'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        <Link href="/profile" className="text-primary hover:underline">
          Cancel and back to profile
        </Link>
      </p>
    </motion.div>
  );
}