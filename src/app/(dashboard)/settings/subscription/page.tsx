'use client';

/**
 * Settings — Subscription
 * Plan information. Billing actions (upgrade, downgrade, cancel) are handled
 * in the Stripe customer portal; the platform exposes no in-app subscription
 * API, so this page surfaces the current plan state and the external portal
 * pointer instead of faking subscription mutations.
 */

import { BadgeCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

export default function SubscriptionSettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

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

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
            <a
              href="/login"
              className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
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
        <h1 className="text-2xl font-bold">Subscription</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your current plan and billing options.
        </p>
      </div>

      <Card>
        <div className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold">Free plan</h2>
                <Badge variant="primary">Active</Badge>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                All core features are included. Paid plans with advanced AI
                insights and integrations are coming soon.
              </p>
            </div>
          </div>

          <ul className="mt-6 space-y-2 text-sm text-gray-600">
            <li>• Unlimited habits, goals, projects and tasks</li>
            <li>• Daily scores, streaks and achievements</li>
            <li>• Weekly and monthly reviews</li>
            <li>• Full data export (JSON / CSV)</li>
          </ul>

          <div className="mt-8 border-t border-gray-100 pt-6">
            <Button variant="outline" disabled title="Stripe portal not configured for this environment">
              Manage subscription
            </Button>
            <p className="mt-3 text-xs text-gray-500">
              Plan changes are processed through the Stripe customer portal; the
              billing page has support contact options.
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}