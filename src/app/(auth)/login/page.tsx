"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Suspense, useState } from 'react';
import { Logo } from '@/components/layout/Logo';
import { AuthCard } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/Button';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '' });

  const getErrorMessage = (err: string | undefined, code: string | undefined): string => {
    switch (code ?? err) {
      case 'InvalidCredentials':
      case 'CredentialsSignin':
        return 'Invalid email or password.';
      case 'EmailNotVerified':
        return 'Please verify your email address before signing in.';
      case 'AccountLocked':
        return 'This account is temporarily locked. Try again later.';
      case 'AccountDeleted':
        return 'This account has been deleted.';
      case 'Configuration':
        return 'We couldn\u2019t sign you in right now. Please try again.';
      default:
        return err || 'Unable to sign in. Please try again.';
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        setError(getErrorMessage(result.error, result.code));
        return;
      }

      // Single client navigation; proxy.ts already guards protected routes.
      router.replace(callbackUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-foreground/80 mb-1">Email</label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
          className="w-full p-3 rounded-lg bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-foreground/80 mb-1">Password</label>
        <input
          id="login-password"
          type="password"
          required
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
          className="w-full p-3 rounded-lg bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : null}

      <Button type="submit" size="lg" isLoading={loading} className="w-full mt-4">
        Sign In
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard>
      <div className="flex justify-center mb-6">
        <Logo variant="icon" size="lg" />
      </div>
      <h1 className="text-2xl font-bold text-center text-foreground mb-2">Welcome Back</h1>
      <p className="text-center text-muted-foreground mb-8">Sign in to continue to RoutineOS</p>

      <Suspense fallback={<p className="text-sm text-muted-foreground text-center">Loading...</p>}>
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account? <Link href="/register" className="text-primary hover:underline">Register</Link>
      </p>
    </AuthCard>
  );
}
