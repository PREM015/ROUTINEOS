'use client';

/**
 * Settings — Billing
 * Billing is handled by the external Stripe portal; the platform has no
 * in-app billing API, so this page points users to the managed portal and
 * support contact instead of pretending to mutate a subscription.
 */

import { CreditCard, Mail, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

export default function BillingSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-56 rounded-xl" />
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

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your payment method and invoices.
        </p>
      </div>

      <Card>
        <div className="p-8 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-4 text-lg font-bold">Manage via Stripe</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Payment method, invoices and plan changes are handled securely in
            the Stripe customer portal. In-app billing is not available yet, so
            there is nothing to change on this page.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="outline" disabled title="Stripe portal not configured for this environment">
              Open Stripe portal
            </Button>
            <a
              href="mailto:billing@routineos.app"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Mail className="h-4 w-4" />
              Contact billing support
            </a>
          </div>
        </div>
      </Card>
    </main>
  );
}