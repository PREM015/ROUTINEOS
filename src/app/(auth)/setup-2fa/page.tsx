'use client';

import Link from 'next/link';
import { Check, Copy, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { AuthCard, AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

/**
 * Two-factor authentication setup page.
 *
 * Client component that requests a TOTP provisioning URI and secret via
 * `POST /api/auth/2fa/setup`, shows them for manual entry (no QR dependency),
 * then verifies a generated code through `POST /api/auth/2fa/verify`.
 */

interface TwoFactorSetupResult {
  secret: string;
  otpauthUrl: string;
}

interface TwoFactorVerifyResult {
  success: boolean;
  message: string;
}

export default function SetupTwoFactorPage() {
  const { init } = useAuth();

  const [setup, setSetup] = useState<TwoFactorSetupResult | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copiedField, setCopiedField] = useState<'url' | 'secret' | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSetup = async () => {
      try {
        const result = await apiRequest<TwoFactorSetupResult>('/api/auth/2fa/setup', {
          method: 'POST',
          body: {},
        });
        if (!cancelled) setSetup(result);
      } catch (err) {
        if (!cancelled) {
          setSetupError(err instanceof Error ? err.message : 'Failed to load 2FA setup');
        }
      }
    };

    void loadSetup();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyToClipboard = async (value: string, field: 'url' | 'secret') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField(null);
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifyError(null);

    if (!/^\d{6}$/.test(code)) {
      setVerifyError('Enter the 6-digit code from your authenticator app');
      return;
    }

    setLoading(true);
    try {
      await apiRequest<TwoFactorVerifyResult>('/api/auth/2fa/verify', {
        method: 'POST',
        body: { code },
      });
      await init();
      setConfirmed(true);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          {confirmed ? (
            <ShieldCheck className="w-8 h-8 text-primary" />
          ) : (
            <Smartphone className="w-8 h-8 text-primary" />
          )}
        </div>
      </div>

      {confirmed ? (
        <>
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">Two-Factor Enabled</h1>
          <p className="text-center text-muted-foreground mb-8">
            Your account is now protected with two-factor authentication. Keep
            your backup codes somewhere safe.
          </p>
          <Link
            href="/settings/security"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
          >
            Go to Security Settings
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">Set Up Two-Factor Auth</h1>
          <p className="text-center text-muted-foreground mb-8">
            Scan or enter the secret below in your authenticator app, then verify a code
          </p>

          {setupError ? (
            <p role="alert" className="text-sm text-destructive text-center mb-4">
              {setupError}
            </p>
          ) : setup ? (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Authenticator URI
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2.5 rounded-lg bg-muted/50 border border-border text-xs text-foreground/80 break-all">
                    {setup.otpauthUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(setup.otpauthUrl, 'url')}
                    className="p-2.5 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Copy authenticator URI"
                  >
                    {copiedField === 'url' ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Manual entry key
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2.5 rounded-lg bg-muted/50 border border-border text-xs text-foreground/80 break-all">
                    {setup.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(setup.secret, 'secret')}
                    className="p-2.5 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Copy manual entry key"
                  >
                    {copiedField === 'secret' ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Open your authenticator app and add this key manually.
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleVerify} noValidate>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/[^0-9]/g, ''))
                    }
                    className={`${AUTH_INPUT_CLASS} text-center tracking-widest`}
                    placeholder="••••••"
                  />
                </div>

                {verifyError && (
                  <p role="alert" className="text-sm text-destructive text-center">
                    {verifyError}
                  </p>
                )}

                <Button type="submit" size="lg" isLoading={loading} className="w-full">
                  Enable Two-Factor Auth
                </Button>
              </form>
            </div>
          ) : (
            <p className="text-center text-muted-foreground animate-pulse">
              Generating your authenticator secret...
            </p>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/settings/security" className="text-primary hover:underline">
              Cancel
            </Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}