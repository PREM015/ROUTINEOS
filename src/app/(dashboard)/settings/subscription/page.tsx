'use client';

/**
 * Settings — Subscription
 *
 * Reads the real plan from `GET /api/billing/subscription` (populated by the
 * Stripe webhook). The previous version hardcoded "Free plan" with an "Active"
 * badge and a permanently-disabled "Manage subscription" button, so a paying
 * customer was told they were on the free plan.
 *
 * Plan changes are still handled in the Stripe customer portal — the platform
 * exposes no in-app mutation endpoint — so that action is offered as an
 * external link and is clearly labelled, rather than a dead disabled button.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, ExternalLink, Mail, ShieldAlert, TriangleAlert } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { BILLING_SUPPORT_EMAIL, isStripeConfigured } from '@/lib/constants/billing';
import type { SubscriptionPlan, SubscriptionStatus } from '@/constants/prisma-enums';

interface SubscriptionView {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  isFreeTier: boolean;
}

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  FREE: 'Free',
  PRO: 'Pro',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
};

const PLAN_FEATURES: Record<SubscriptionPlan, string[]> = {
  FREE: [
    'Unlimited habits, goals, projects and tasks',
    'Daily scores, streaks and achievements',
    'Weekly and monthly reviews',
    'Full data export (JSON / CSV)',
  ],
  PRO: [
    'Everything in Free',
    'AI-powered insights and pattern detection',
    'Third-party integrations',
    'Priority support',
  ],
  PREMIUM: ['Everything in Pro', 'Advanced automations', 'Deeper analytics history'],
  ENTERPRISE: ['Everything in Premium', 'Team management', 'SSO and audit exports'],
};

const STATUS_BADGES: Record<SubscriptionStatus, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Active' },
  PAST_DUE: { variant: 'danger', label: 'Past due' },
  CANCELLED: { variant: 'default', label: 'Cancelled' },
  UNPAID: { variant: 'danger', label: 'Unpaid' },
};

export default function SubscriptionSettingsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  /**
   * Open the Stripe customer portal.
   *
   * The button this replaces was permanently `disabled` with a tooltip as its
   * only behaviour. The portal is a hosted page behind a short-lived session,
   * so the URL has to be minted server-side; the customer id is resolved from
   * the caller's own row in the service, never from the request.
   */
  const openPortal = async () => {
    setPortalBusy(true);
    setPortalError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: '/settings/subscription' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.url) {
        throw new Error(json?.error || 'Could not open the billing portal');
      }
      // Full navigation: Stripe is a different origin, so `window.location`
      // rather than a client-side router push.
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

    void apiRequest<SubscriptionView>('/api/billing/subscription')
      .then((data) => {
        if (!cancelled) setSubscription(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : 'Failed to load your subscription.'
        );
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
          <Skeleton className="h-64 rounded-xl" />
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

  const plan = subscription?.plan ?? 'FREE';
  const status = subscription?.status ?? 'ACTIVE';
  const statusBadge = STATUS_BADGES[status];
  const stripeReady = isStripeConfigured();

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Subscription</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your current plan and billing options.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <Card>
        <div className="p-6">
          {loading || !subscription ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold">{PLAN_LABELS[plan]} plan</h2>
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                </div>
              </div>

              {status === 'PAST_DUE' && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Your last payment failed. Update your payment method in the
                    billing portal to avoid losing access.
                  </span>
                </div>
              )}

              {subscription.cancelAtPeriodEnd && (
                <p className="mt-4 rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                  Your subscription is set to cancel on{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. You
                  keep full access until then.
                </p>
              )}

              {!subscription.isFreeTier && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Current period ends{' '}
                  <span className="font-medium text-foreground">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </span>
                  .
                </p>
              )}

              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                {PLAN_FEATURES[plan].map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <div className="mt-8 border-t border-border pt-6">
                {stripeReady ? (
                  <p className="text-sm text-muted-foreground">
                    Plan changes, cancellations and invoices are handled in the
                    Stripe customer portal.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Billing is not configured for this environment, so there is no
                    portal to open. Contact support to change your plan.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {stripeReady && (
                    <Button
                      variant="outline"
                      onClick={() => void openPortal()}
                      disabled={portalBusy}
                      aria-busy={portalBusy}
                    >
                      <span className="inline-flex items-center gap-2">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        {portalBusy ? 'Opening…' : 'Manage subscription'}
                      </span>
                    </Button>
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
                <p className="mt-3 text-xs text-muted-foreground">
                  See also{' '}
                  <Link href="/settings/billing" className="text-primary hover:underline">
                    Billing
                  </Link>{' '}
                  for payment methods and invoices.
                </p>
              </div>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}
