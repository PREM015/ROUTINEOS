'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AUTH_INPUT_CLASS } from '@/components/auth/AuthCard';

interface RegisterResponse {
  success: boolean;
  message: string;
  data?: { id: string; email: string };
  autoLogin?: boolean;
  error?: string;
  details?: { fieldErrors?: Record<string, string[]> };
}

type SocialProvider = { id: 'google' | 'github'; label: string };

/**
 * The rules the server actually enforces.
 *
 * `registerSchema` (`lib/validation/auth.ts` → `schemas/auth.schema.ts`) is
 * `min(8) + /[A-Z]/ + /[0-9]/`, plus a 2–50 character name. Note that
 * `APP_CONFIG.validation.password` additionally claims `requireLowercase` and a
 * 128-character maximum — neither is enforced on this path, so this checklist
 * mirrors the schema rather than the config, and adding a rule here that the
 * server does not check would only produce false confidence.
 */
const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'number', label: 'One number', test: (v: string) => /[0-9]/.test(v) },
] as const;

export function RegisterForm({ socialProviders = [] }: { socialProviders?: SocialProvider[] }) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  /** Non-field problems: network, rate limit, unknown server error. */
  const [error, setError] = useState('');
  /** Per-field messages, including those mapped back from the server. */
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'email' | 'password', string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const rules = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(form.password) })),
    [form.password]
  );
  const passwordComplete = rules.every((rule) => rule.ok);
  const passwordTouched = form.password.length > 0;

  const setField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError('');
    setFieldErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  /**
   * `Intl` can throw in a locked-down or ancient browser, and the field is
   * optional server-side, so this is best-effort by design.
   *
   * Sending it at signup is worthwhile: `UserSettings.timezone` is the
   * authoritative field every date-bucketing read uses (habit logs, daily
   * scores), and registering without it left the account on the `UTC` default
   * until the user found the timezone setting.
   */
  const detectTimezone = (): string | undefined => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    // Validate locally first so an obviously invalid password does not cost a
    // round trip and a rate-limit token.
    const nextErrors: typeof fieldErrors = {};
    if (form.name.trim().length < 2) {
      nextErrors.name = 'Enter at least 2 characters';
    } else if (form.name.length > 50) {
      nextErrors.name = 'Keep this under 50 characters';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = 'Enter a valid email address';
    }
    for (const rule of rules) {
      if (!rule.ok) {
        nextErrors.password = 'Your password does not meet the requirements yet';
        break;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setLoading(true);
    setError('');
    setFieldErrors({});

    try {
      const timezone = detectTimezone();
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The body is always sent. Omitting it when `timezone` could not be
        // detected would post an empty request, which the route rejects at
        // `req.json()` with a 400 and no usable message.
        body: JSON.stringify({ ...form, ...(timezone ? { timezone } : {}) }),
      });

      /**
       * The route is rate limited, so a 429 is an expected outcome rather than
       * an exception. A bare `res.json()` would throw on the non-JSON body or
       * surface a raw rate-limit message, so the status is branched first.
       */
      if (res.status === 429) {
        setError('Too many sign-up attempts from this network. Please wait a few minutes and try again.');
        return;
      }

      const data: RegisterResponse = await res.json().catch(() => null);

      if (!res.ok) {
        /**
         * Validation failures come back as `details: parsed.error.flatten()`,
         * which is keyed by field. Surfacing them inline is far more useful
         * than one generic banner, and it keeps the client and server rules
         * visibly consistent.
         */
        const fieldDetails = data?.details?.fieldErrors as
          | Record<string, string[] | undefined>
          | undefined;
        if (fieldDetails) {
          const mapped: typeof fieldErrors = {};
          for (const key of ['name', 'email', 'password'] as const) {
            const first = fieldDetails[key]?.[0];
            if (first) mapped[key] = first;
          }
          if (Object.keys(mapped).length > 0) {
            setFieldErrors(mapped);
            setError('Please correct the highlighted fields.');
            return;
          }
        }
        setError(data?.error || 'Unable to create your account. Please try again.');
        return;
      }

      // Account created successfully, auto-login then redirect to dashboard
      if (data.autoLogin) {
        await signIn('credentials', {
          email: form.email,
          password: form.password,
          callbackUrl: '/dashboard',
          redirect: false,
        });
      }
      router.push('/dashboard');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (providerId: string) => {
    setSocialLoading(providerId);
    await signIn(providerId, { callbackUrl: '/dashboard' });
  };

  // ------------------------------------------------------------------- form
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
          id="register-name"
          label="Name"
          type="text"
          required
          autoComplete="name"
          placeholder="Alex Morgan"
          icon={<UserIcon className="h-4 w-4" />}
          className={AUTH_INPUT_CLASS}
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          error={fieldErrors.name}
        />

        <Input
          id="register-email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          inputMode="email"
          placeholder="you@example.com"
          icon={<Mail className="h-4 w-4" />}
          className={AUTH_INPUT_CLASS}
          value={form.email}
          onChange={(e) => setField('email', e.target.value)}
          error={fieldErrors.email}
        />

        <div>
          <Input
            id="register-password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="••••••••"
            className={AUTH_INPUT_CLASS}
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            error={fieldErrors.password}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
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

          {/*
            The requirements were previously invisible, so a user could only
            discover the server's rules by submitting and reading an error. The
            list stays hidden until typing starts to avoid nagging an empty
            field, and `aria-live` announces changes without stealing focus.
          */}
          {passwordTouched ? (
            <ul
              aria-live="polite"
              className="mt-2.5 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3 sm:gap-x-3"
            >
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={`flex items-center gap-1.5 transition-colors ${
                    rule.ok ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      rule.ok
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border'
                    }`}
                  >
                    {rule.ok ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="sr-only">{rule.ok ? 'Requirement met: ' : 'Requirement not met: '}</span>
                  {rule.label}
                </li>
              ))}
            </ul>
          ) : null}

          {passwordTouched && passwordComplete ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Password meets the requirements
            </p>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0">{error}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          isLoading={loading}
          disabled={passwordTouched && !passwordComplete}
          className="mt-2 w-full"
        >
          Create account
        </Button>

        {/*
          Not a required checkbox: gating sign-up behind an unticked box
          reduces completion and the "by continuing you agree" phrasing carries
          the notice without adding a failure state. The links are the point —
          an unlinked privacy policy is worse than none.
        */}
        <p className="flex items-start justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-primary">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-primary">
              Privacy Policy
            </Link>
            .
          </span>
        </p>
      </form>
    </div>
  );
}
