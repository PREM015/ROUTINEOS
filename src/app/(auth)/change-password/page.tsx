'use client';

import Link from 'next/link';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { AuthCard, AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

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
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <KeyRound className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Change Password</h1>
      <p className="text-center text-muted-foreground mb-8">Update your account password</p>

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Current Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className={cn(
              AUTH_INPUT_CLASS,
              fieldErrors.currentPassword && 'border-destructive focus:border-destructive focus:ring-destructive'
            )}
            placeholder="••••••••"
          />
          {fieldErrors.currentPassword && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.currentPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">New Password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className={cn(
              AUTH_INPUT_CLASS,
              fieldErrors.newPassword && 'border-destructive focus:border-destructive focus:ring-destructive'
            )}
            placeholder="At least 8 characters"
          />
          {fieldErrors.newPassword && (
            <p className="mt-1 text-sm text-destructive">{fieldErrors.newPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-1">Confirm New Password</label>
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
        {success && (
          <div className="flex items-start gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              {success}.{' '}
              <Link href="/profile" className="text-primary hover:underline">
                Back to profile
              </Link>
            </span>
          </div>
        )}

        <Button type="submit" size="lg" isLoading={loading} className="w-full mt-4">
          Change Password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/profile" className="text-primary hover:underline">
          Cancel and back to profile
        </Link>
      </p>
    </AuthCard>
  );
}