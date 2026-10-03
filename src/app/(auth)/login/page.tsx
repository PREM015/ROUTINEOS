import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/layout/Logo';
import { AuthCard } from '@/components/auth/AuthCard';
import { LoginForm } from './LoginForm';
import { privateMetadata } from '@/lib/seo';

/**
 * Sign-in page.
 *
 * Converted from a `'use client'` file to a server component. The reason is not
 * cosmetic: a client component cannot export `metadata`, so this page — the
 * single highest-traffic page in the product — was inheriting the bare
 * `(auth)` group title and had no description of its own.
 */
export const metadata: Metadata = privateMetadata(
  'Sign in',
  'Sign in to RoutineOS to pick up your habits, routines, goals, and daily score where you left off.'
);

export default function LoginPage() {
  /**
   * Social sign-in is only offered when the provider is actually configured.
   * `lib/auth.ts` registers Google/GitHub conditionally on these exact env
   * vars, so mirroring that check here is what keeps a sign-in button from
   * appearing for a provider that would fail with a configuration error.
   *
   * These are read server-side on purpose: they are unprefixed secrets and must
   * never reach the client bundle. Only the provider *names* are passed down.
   */
  const socialProviders = [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [{ id: 'google', label: 'Google' } as const]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [{ id: 'github', label: 'GitHub' } as const]
      : []),
  ];

  return (
    <AuthCard>
      <div className="mb-6 flex justify-center">
        <Logo variant="icon" size="lg" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-foreground">
        Welcome back
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        Sign in to continue to RoutineOS
      </p>

      {/*
        `LoginForm` reads `callbackUrl` via `useSearchParams`, which requires a
        Suspense boundary during static rendering. The fallback is a skeleton
        rather than text so the card does not visibly reflow when it resolves.
      */}
      <Suspense fallback={<FormSkeleton />}>
        <LoginForm socialProviders={socialProviders} />
      </Suspense>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          Create one
        </Link>
      </p>
    </AuthCard>
  );
}

/** Placeholder with the same geometry as the real form, to avoid layout shift. */
function FormSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-[42px] animate-pulse rounded-lg bg-muted/60" />
        </div>
      ))}
      <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
