import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { AuthCard } from '@/components/auth/AuthCard';
import { RegisterForm } from './RegisterForm';
import { privateMetadata } from '@/lib/seo';

/**
 * Registration page.
 *
 * Converted from `'use client'` to a server component for the same reason as
 * the sign-in page: a client component cannot export `metadata`, so this had
 * no title or description of its own.
 */
export const metadata: Metadata = privateMetadata(
  'Create your account',
  'Create a free RoutineOS account to track habits, build routines, set goals, and see one honest score for your whole day.'
);

export default function RegisterPage() {
  /**
   * Mirrors the conditional provider registration in `lib/auth.ts`, so a
   * social sign-up button is only rendered for a provider that is actually
   * configured. Read server-side because these are unprefixed secrets; only
   * the provider names reach the client.
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
        Create your account
      </h1>
      <p className="mb-8 text-center text-muted-foreground">
        Free to use. No card required.
      </p>

      <RegisterForm socialProviders={socialProviders} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
