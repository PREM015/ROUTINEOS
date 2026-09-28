'use client';

/**
 * Settings — Danger Zone
 *
 * The delete button previously had no `onClick` at all. It now drives
 * `DELETE /api/auth/delete-account`, which soft-deletes the account and ends
 * the session. Deletion is irreversible, so it is gated behind typing the
 * word DELETE and a second explicit confirmation step.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useSettingsStore } from '@/store/settings.store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';

const CONFIRM_PHRASE = 'DELETE';

export default function DangerZonePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout } = useAuth();

  const [armed, setArmed] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </a>
          </div>
        </Card>
      </main>
    );
  }

  if (done) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-xl font-bold">Account deleted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account has been scheduled for deletion and this session has
              ended.
            </p>
            <Button className="mt-6" onClick={() => router.push('/login')}>
              Back to sign in
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await apiRequest('/api/auth/delete-account', {
        method: 'DELETE',
        body: {
          confirm: true,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
      // The local settings row is about to be cascade-deleted; drop it so a
      // subsequent sign-in as another account never reads stale preferences.
      useSettingsStore.getState().reset();
      setDone(true);
      await logout();
      router.push('/login');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete your account.'
      );
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-destructive">Danger Zone</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Irreversible account actions.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-destructive/50 bg-destructive/5 p-6">
        <h2 className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          Delete Account
        </h2>
        <p className="text-sm text-muted-foreground">
          Deleting your account removes your habits, routines, goals, scores
          and history. This cannot be undone. Export your data first if you want
          a copy.
        </p>

        {!confirming ? (
          <Button
            variant="danger"
            onClick={() => setArmed(true)}
            disabled={armed}
          >
            {armed ? 'Continue below' : 'Delete My Account'}
          </Button>
        ) : (
          <div className="space-y-4 rounded-lg border border-destructive/30 bg-background p-4">
            <p className="text-sm font-medium text-destructive">
              This is your last chance. Type{' '}
              <span className="font-mono font-bold">{CONFIRM_PHRASE}</span> to
              confirm.
            </p>

            <Input
              label="Confirmation"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              aria-describedby="danger-zone-reason"
            />

            <Textarea
              label="Why are you leaving? (optional)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Helps us improve. Sorry to see you go."
            />

            {error && (
              <div
                className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="danger"
                onClick={() => void deleteAccount()}
                disabled={confirmText.trim().toUpperCase() !== CONFIRM_PHRASE}
                isLoading={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Deleting…
                  </>
                ) : (
                  'Permanently delete my account'
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirming(false);
                  setArmed(false);
                  setConfirmText('');
                  setError(null);
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
