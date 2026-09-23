'use client';

/**
 * Settings — Security
 * Two-factor authentication lifecycle via /api/auth/2fa/setup,
 * /api/auth/2fa/verify and /api/auth/2fa/disable, password changes via
 * /api/auth/change-password, and a preview of active devices via
 * GET /api/auth/sessions.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Laptop, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { getRelativeTime } from '@/lib/utils';

interface DeviceSessionInfo {
  id: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  location: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
}

export default function SecuritySettingsPage() {
  const { user, isAuthenticated, isLoading: authLoading, updateUser } = useAuth();

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.twoFactorEnabled ?? false);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaBusy, setTfaBusy] = useState(false);
  const [tfaError, setTfaError] = useState<string | null>(null);
  const [tfaSuccess, setTfaSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [sessions, setSessions] = useState<DeviceSessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      setSessions(await apiRequest<DeviceSessionInfo[]>('/api/auth/sessions'));
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync 2FA state on mount
      setTwoFactorEnabled(user.twoFactorEnabled);
      void loadSessions();
    }
  }, [user, loadSessions]);

  const startSetup = async () => {
    setTfaBusy(true);
    setTfaError(null);
    setTfaSuccess(null);
    try {
      const data = await apiRequest<{ secret: string; otpauthUrl: string }>('/api/auth/2fa/setup', {
        method: 'POST',
        body: {},
      });
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
    } catch (err) {
      setTfaError(err instanceof ApiError ? err.message : 'Failed to start 2FA setup.');
    } finally {
      setTfaBusy(false);
    }
  };

  const verifyCode = async () => {
    setTfaBusy(true);
    setTfaError(null);
    setTfaSuccess(null);
    try {
      await apiRequest('/api/auth/2fa/verify', {
        method: 'POST',
        body: { code: tfaCode.trim() },
      });
      setTwoFactorEnabled(true);
      updateUser({ twoFactorEnabled: true });
      setSecret(null);
      setOtpauthUrl(null);
      setTfaCode('');
      setTfaSuccess('Two-factor authentication enabled.');
    } catch (err) {
      setTfaError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setTfaBusy(false);
    }
  };

  const disableTwoFactor = async () => {
    setTfaBusy(true);
    setTfaError(null);
    setTfaSuccess(null);
    try {
      await apiRequest('/api/auth/2fa/disable', {
        method: 'POST',
        body: { code: tfaCode.trim() },
      });
      setTwoFactorEnabled(false);
      updateUser({ twoFactorEnabled: false });
      setTfaCode('');
      setTfaSuccess('Two-factor authentication disabled.');
    } catch (err) {
      setTfaError(err instanceof ApiError ? err.message : 'Failed to disable 2FA.');
    } finally {
      setTfaBusy(false);
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Failed to change password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
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

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Two-factor authentication, password and active sessions.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            {twoFactorEnabled ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
            <h2 className="text-lg font-bold">Two-factor authentication</h2>
            <Badge variant={twoFactorEnabled ? 'success' : 'default'}>
              {twoFactorEnabled ? 'Enabled' : 'Off'}
            </Badge>
          </div>
          <div className="p-6">
            {tfaError && (
              <div className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                {tfaError}
              </div>
            )}
            {tfaSuccess && (
              <div className="mb-4 flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400" role="status">
                <CheckCircle2 className="h-4 w-4" />
                {tfaSuccess}
              </div>
            )}

            {!twoFactorEnabled && secret === null && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Add an authenticator app for an extra layer of security on login.
                </p>
                <Button className="mt-4" onClick={() => void startSetup()} isLoading={tfaBusy}>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Set up authenticator
                </Button>
              </div>
            )}

            {!twoFactorEnabled && secret !== null && otpauthUrl !== null && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Scan the QR code with your authenticator app, or enter the secret manually:
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Secret</p>
                    <p className="rounded-md bg-muted/50 p-3 font-mono text-xs">{secret}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Setup URI</p>
                    <p className="break-all rounded-md bg-muted/50 p-3 font-mono text-xs">{otpauthUrl}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <Input
                      label="6-digit code"
                      value={tfaCode}
                      onChange={(event) => setTfaCode(event.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </div>
                  <Button onClick={() => void verifyCode()} isLoading={tfaBusy} disabled={tfaCode.trim().length !== 6}>
                    Verify and enable
                  </Button>
                </div>
              </div>
            )}

            {twoFactorEnabled && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Two-factor authentication is active on your account.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <Input
                      label="Recovery code"
                      value={tfaCode}
                      onChange={(event) => setTfaCode(event.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => void disableTwoFactor()}
                    isLoading={tfaBusy}
                    disabled={tfaCode.trim().length !== 6}
                  >
                    Disable 2FA
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Change password</h2>
          </div>
          <div className="space-y-4 p-6">
            {passwordError && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400" role="status">
                <CheckCircle2 className="h-4 w-4" />
                {passwordSuccess}
              </div>
            )}
            <Input
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <Input
              label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
            <Input
              label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <Button
              onClick={() => void changePassword()}
              isLoading={passwordBusy}
              disabled={currentPassword.length === 0 || newPassword.length === 0 || confirmPassword.length === 0}
            >
              Update password
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 border-b border-border px-6 py-4">
            <Laptop className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Active sessions</h2>
          </div>
          <div className="p-6">
            {sessionsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active sessions found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {sessions.slice(0, 5).map((session) => (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {session.deviceName ?? session.deviceType ?? 'Unknown device'}
                        {session.isCurrent && <Badge variant="primary" className="ml-2">This device</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {session.location ?? 'Unknown location'}
                        {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                        {' · '}
                        active {getRelativeTime(session.lastActiveAt)}
                      </p>
                    </div>
                    <a href="/settings/sessions" className="text-sm text-primary hover:underline">
                      Manage
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}