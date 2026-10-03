'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Info, KeyRound, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';

type SocialProvider = { id: 'google' | 'github'; label: string };

/**
 * Sign-in form.
 *
 * Improvements over the previous inline version:
 *
 *  - **Open-redirect fix.** `callbackUrl` came straight out of the query
 *    string and was passed to `router.replace()` unvalidated, so
 *    `/login?callbackUrl=https://evil.example` would navigate a freshly
 *    authenticated user off-site. It is now restricted to a same-origin
 *    absolute path.
 *  - **Recovery was unreachable.** `/forgot-password` and
 *    `/resend-verification` existed, but nothing on the sign-in page linked to
 *    them, so a user who forgot their password or never confirmed their
 *    address was stuck. Both are now offered contextually.
 *  - **Two-factor flow was mis-reported.** A single `TwoFactorRequired` code
 *    covers two different situations — "you have not entered a code yet" and
 *    "the code you entered was wrong" — and both rendered as "That two-factor
 *    code is not valid". The first is now a neutral prompt, the second an
 *    error. Focus also moves to the code field when it appears, instead of
 *    leaving a keyboard user on the button they just pressed.
 *  - Password visibility toggle, Caps Lock detection, and `aria-invalid` /
 *    `aria-describedby` wiring on the inputs.
 *  - Submits on Enter from any field, and the submit button reflects which
 *    step of the two-factor flow it completes.
 */
export function LoginForm({ socialProviders = [] }: { socialProviders?: SocialProvider[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<'' | 'credentials' | 'code'>('');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', totpCode: '' });

  const codeRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));

  // Move focus to the newly revealed code field so the next keystroke lands
  // somewhere useful.
  useEffect(() => {
    if (needsTwoFactor) codeRef.current?.focus();
  }, [needsTwoFactor]);

  const setField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    // Clear the server error as soon as the user starts correcting input,
    // otherwise a stale "wrong password" sits under a field being retyped.
    if (error) setError('');
    if (fieldError) setFieldError('');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setFieldError('');

    try {
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        ...(form.totpCode ? { totpCode: form.totpCode } : {}),
        redirect: false,
      });

      if (result?.error) {
        const code = result.code ?? result.error;

        if (code === 'TwoFactorRequired' && !needsTwoFactor) {
          // Password accepted, two-factor now needed: prompt rather than
          // "error", and reveal the field.
          setNeedsTwoFactor(true);
          return;
        }

        if (code === 'TwoFactorRequired') {
          setFieldError('code');
          setError('That code was not accepted. Check your authenticator app — the code changes every 30 seconds.');
          return;
        }

        if (code === 'EmailNotVerified') {
          setFieldError('credentials');
          setError('Please verify your email address before signing in.');
          return;
        }

        setFieldError('credentials');
        setError(messageFor(code, result.error));
        return;
      }

      // Single client navigation; `src/proxy.ts` already guards protected routes.
      router.replace(callbackUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (providerId: string) => {
    setSocialLoading(providerId);
    // Full redirect: the OAuth round trip is a top-level navigation.
    await signIn(providerId, { callbackUrl });
  };

  const emailInvalid = fieldError === 'credentials';
  const codeInvalid = fieldError === 'code';

  return (
    <div>
      {socialProviders.length > 0 ? (
        <>
          <div className="grid gap-2">
            {socialProviders.map((provider) => (
              <Button
                key={provider.id}
                type="button"
                variant="outline"
                className="w-full"
                isLoading={socialLoading === provider.id}
                disabled={socialLoading !== null || loading}
                onClick={() => void handleSocial(provider.id)}
              >
                Continue with {provider.label}
              </Button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Input
          id="login-email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          spellCheck={false}
          inputMode="email"
          placeholder="you@example.com"
          icon={<Mail className="h-4 w-4" />}
          className={AUTH_INPUT_CLASS}
          value={form.email}
          onChange={(e) => setField('email', e.target.value)}
          error={emailInvalid ? 'Check this address and try again' : undefined}
        />

        <div>
          <Input
            id="login-password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={AUTH_INPUT_CLASS}
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            onKeyUp={(e) => setCapsLock(e.getModifierState && e.getModifierState('CapsLock'))}
            error={emailInvalid ? 'Incorrect email or password' : undefined}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                // aria-pressed communicates the toggle state to assistive tech.
                aria-pressed={showPassword}
                className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            }
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            {capsLock ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Caps Lock is on
              </p>
            ) : (
              <span />
            )}
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {needsTwoFactor ? (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <Input
              ref={codeRef}
              id="login-totp"
              label="Two-factor code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="123456"
              className={`${AUTH_INPUT_CLASS} text-center font-mono text-lg tracking-[0.35em]`}
              value={form.totpCode}
              onChange={(e) =>
                setField(
                  'totpCode',
                  e.target.value.replace(/\D/g, '').slice(0, 6)
                )
              }
              error={codeInvalid ? 'That code was not accepted' : undefined}
              helperText="Enter the 6-digit code from your authenticator app."
            />
          </div>
        ) : null}

        {/*
          `role="alert"` announces the failure immediately. It is a live region
          rather than a redirect to a page, because losing the typed password
          to read a message is a worse outcome than the message itself.
        */}
        {error ? (
          <div
            ref={errorRef}
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p>{error}</p>
              {fieldError === 'credentials' ? (
                <p className="mt-1.5 text-xs">
                  <Link href="/forgot-password" className="underline underline-offset-2">
                    Reset your password
                  </Link>{' '}
                  or{' '}
                  <Link href="/resend-verification" className="underline underline-offset-2">
                    resend the verification email
                  </Link>
                  .
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          isLoading={loading}
          className="mt-2 w-full"
        >
          {needsTwoFactor ? 'Verify and sign in' : 'Sign in'}
        </Button>

        {/*
          Shown only while the two-factor step is active, so the security
          context is explicit at the moment a code is being typed.
        */}
        {needsTwoFactor ? (
          <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <KeyRound className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Two-factor authentication protects this account.
          </p>
        ) : (
          <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Sessions end after 6 hours, and sooner if you are idle.
          </p>
        )}
      </form>
    </div>
  );
}

/**
 * Constrain the post-sign-in destination to a path on this origin.
 *
 * `callbackUrl` is attacker-controllable through the query string. Passing an
 * absolute URL to `router.replace()` navigates the browser off-site, so an
 * attacker could sign a victim in and then land them on a convincing phishing
 * page immediately after a *successful* authentication — the worst possible
 * moment to be redirected somewhere untrusted.
 *
 * Accepts only a leading single `/` and rejects protocol-relative `//host`
 * forms, which browsers treat as absolute.
 */
export function safeCallbackUrl(raw: string | null): string {
  const fallback = '/dashboard';
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  try {
    // Reject anything that parses to a different origin.
    const parsed = new URL(raw, 'http://placeholder.invalid');
    if (parsed.origin !== 'http://placeholder.invalid') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function messageFor(code: string | undefined, fallback: string | undefined): string {
  switch (code) {
    case 'InvalidCredentials':
    case 'CredentialsSignin':
      return 'Invalid email or password.';
    case 'AccountLocked':
      return 'This account is temporarily locked after too many failed attempts. Try again in a few minutes, or reset your password.';
    case 'AccountDeleted':
      return 'This account has been deleted.';
    case 'Configuration':
      return 'We could not sign you in right now. Please try again.';
    default:
      return fallback || 'Unable to sign in. Please try again.';
  }
}
