'use client';

/**
 * Settings — Billing
 *
 * Payment method, invoices and the Stripe customer portal entry point.
 *
 * The previous version rendered a permanently-disabled "Open Stripe portal"
 * button with the title "Stripe portal not configured for this environment" —
 * hardcoded, regardless of the actual environment. This page asks
 * `GET /api/billing/config` at runtime and either offers a real portal link or
 * explains plainly that billing is not configured.
 *
 * The portal is hosted by Stripe; the app deliberately has no in-app billing
 * mutation API, so nothing here pretends to change a payment method.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink, Mail, ShieldAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { BILLING_SUPPORT_EMAIL } from '@/lib/constants/billing';
import type { SubscriptionPlan, SubscriptionStatus } from '@/constants/prisma-enums';

interface BillingConfig {
  configured: boolean;
  publishableKey: string | null;
}

interface SubscriptionView {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  isFreeTier: boolean;
}

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
};

export default function BillingSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  /**
   * Open the Stripe customer portal.
   *
   * Replaces a permanently-disabled button whose `title` tooltip was the whole
   * feature. The portal URL must be minted per-session by the server, so it
   * cannot be a plain `href`.
   */
  const openPortal = async () => {
    setPortalBusy(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: '/settings/billing' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error || 'Could not open the billing portal');
      }
      window.location.assign(json.data.url as string);
    } catch (err) {
      setPortalError(
        err instanceof Error ? err.message : 'Could not open the billing portal'
      );
    } finally {
      setPortalBusy(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Both are independent reads; neither is required for the other to render.
    void Promise.allSettled([
      apiRequest<BillingConfig>('/api/billing/config'),
      apiRequest<SubscriptionView>('/api/billing/subscription'),
    ])
      .then(([configResult, subscriptionResult]) => {
        if (cancelled) return;
        if (configResult.status === 'fulfilled') setConfig(configResult.value);
        if (subscriptionResult.status === 'fulfilled') {
          setSubscription(subscriptionResult.value);
        }
        const failure = [configResult, subscriptionResult].find(
          (r) => r.status === 'rejected'
        );
        if (failure?.status === 'rejected') {
          setError(
            failure.reason instanceof ApiError
              ? failure.reason.message
              : 'Failed to load billing details.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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
            <Link
              href="/login"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary light-sweep glow-neon px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 active:scale-[0.97]"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const configured = config?.configured ?? false;

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your payment method and invoices.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-lg font-bold">Current plan</h2>
              </div>
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : subscription ? (
                <Badge variant={subscription.isFreeTier ? 'default' : 'success'}>
                  {PLAN_LABELS[subscription.plan]}
                </Badge>
              ) : null}
            </div>

            {subscription && !subscription.isFreeTier && (
              <p className="mt-3 text-sm text-muted-foreground">
                Renews or ends on{' '}
                <span className="font-medium text-foreground">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
                .
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {configured ? (
                <Button
                  variant="outline"
                  onClick={() => void openPortal()}
                  disabled={portalBusy}
                  aria-busy={portalBusy}
                >
                  <span className="inline-flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    {portalBusy ? 'Opening…' : 'Open Stripe portal'}
                  </span>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Stripe billing is not configured for this environment. Payment
                  methods and invoices are unavailable.
                </p>
              )}
              <a
                href={`mailto:${BILLING_SUPPORT_EMAIL}`}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Contact billing support
              </a>
            </div>
            {portalError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {portalError}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="text-lg font-bold">How billing works here</h2>
            <ul className="mt-3 list-inside space-y-1 text-sm text-muted-foreground">
              <li>
                • Your plan is recorded from Stripe webhook events, not edited
                in-app.
              </li>
              <li>
                • Changing plan, cancelling, or updating a card happens in the
                Stripe customer portal.
              </li>
              <li>
                • Invoices are issued and hosted by Stripe.
              </li>
              <li>
                • Your data is exportable at any time regardless of plan — see{' '}
                <Link href="/settings/export" className="text-primary hover:underline">
                  Export
                </Link>
                .
              </li>
            </ul>
          </div>
        </Card>
      </div>
    </main>
  );
}
