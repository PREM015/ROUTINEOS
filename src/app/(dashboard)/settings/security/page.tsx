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
import { QRCodeSVG } from 'qrcode.react';
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
  /** Code typed while *enabling* 2FA. */
  const [setupCode, setSetupCode] = useState('');
  /** Code typed while *disabling* 2FA. */
  const [disableCode, setDisableCode] = useState('');
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
  /**
   * Set when the session list could not be loaded.
   *
   * The previous `catch { setSessions([]) }` made a failed request render
   * "No active sessions found." That is a security *claim* to the user — it
   * asserts nothing is wrong — produced by a 500. An unknown state must not be
   * reported as a known-good one.
   */
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      let deviceId: string | null = null;
      try {
        deviceId = window.localStorage.getItem('routineos.device.id');
      } catch {
        deviceId = null;
      }
      setSessions(
        await apiRequest<DeviceSessionInfo[]>(
          '/api/auth/sessions',
          deviceId ? { query: { deviceId } } : undefined
        )
      );
    } catch (err) {
      setSessionsError(
        err instanceof Error ? err.message : 'Failed to load active sessions'
      );
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

  /** Discard an in-progress setup so the panel is not soft-locked. */
  const cancelSetup = () => {
    setSecret(null);
    setOtpauthUrl(null);
    setSetupCode('');
    setTfaError(null);
    setTfaSuccess(null);
  };

  const startSetup = async () => {
    setTfaBusy(true);
    setTfaError(null);
    setTfaSuccess(null);
    setSetupCode('');
    setDisableCode('');
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
        body: { code: setupCode.trim() },
      });
      setTwoFactorEnabled(true);
      updateUser({ twoFactorEnabled: true });
      setSecret(null);
      setOtpauthUrl(null);
      setSetupCode('');
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
        body: { code: disableCode.trim() },
      });
      setTwoFactorEnabled(false);
      updateUser({ twoFactorEnabled: false });
      setDisableCode('');
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
      setPasswordSuccess(
        'Password changed. Every other device has been signed out.'
      );
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
                  Scan this QR code with your authenticator app, or enter the
                  secret manually:
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                      QR code
                    </p>
                    {/* The copy below promises a QR code; previously only the
                        raw secret and otpauth URI were shown. */}
                    <div className="inline-block rounded-md bg-white p-3">
                      <QRCodeSVG
                        value={otpauthUrl}
                        size={168}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                        Secret
                      </p>
                      <p className="rounded-md bg-muted/50 p-3 font-mono text-xs break-all">
                        {secret}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                        Setup URI
                      </p>
                      <p className="rounded-md bg-muted/50 p-3 font-mono text-xs break-all">
                        {otpauthUrl}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <Input
                      label="6-digit code"
                      value={setupCode}
                      onChange={(event) => setSetupCode(event.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <Button onClick={() => void verifyCode()} isLoading={tfaBusy} disabled={setupCode.trim().length !== 6}>
                    Verify and enable
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={cancelSetup}
                    disabled={tfaBusy}
                    title="Discard this secret and start over later"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {twoFactorEnabled && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Two-factor authentication is active on your account. Disabling
                  it requires a current code from your authenticator app.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <Input
                      label="Authenticator code"
                      helperText="Not a recovery code — this is the current 6-digit code from your app."
                      value={disableCode}
                      onChange={(event) => setDisableCode(event.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => void disableTwoFactor()}
                    isLoading={tfaBusy}
                    disabled={disableCode.trim().length !== 6}
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
            ) : sessionsError ? (
              <div>
                <p role="alert" className="text-sm text-destructive">
                  {sessionsError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  className="mt-2 text-sm font-semibold text-primary hover:underline"
                >
                  Try again
                </button>
              </div>
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