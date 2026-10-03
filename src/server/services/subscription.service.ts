import type { UserSubscription } from '@/generated/prisma';
import { SubscriptionRepository } from '@/server/repositories/subscription.repository';
import Stripe from 'stripe';
import type { UserId } from '@/types/ids';

/**
 * Subscription Service
 *
 * Read model for the `UserSubscription` row that `POST /api/billing/webhook`
 * writes from Stripe events, plus the entry point to Stripe's hosted customer
 * portal.
 *
 * The Settings > Subscription and Settings > Billing pages previously hardcoded
 * "Free plan / Active" and rendered a permanently-disabled "Manage
 * subscription" button, so a paying customer saw the wrong plan and had no way
 * to change it. This service is the single place that resolves what a user's
 * actual plan is.
 */

/** What the settings pages need; deliberately excludes Stripe identifiers. */
export interface SubscriptionView {
  plan: UserSubscription['plan'];
  status: UserSubscription['status'];
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** True when the row exists and is in a good standing. */
  isActive: boolean;
  /** No row at all means a free-tier account. */
  isFreeTier: boolean;
}

/** Why a portal session could not be created. All are actionable by the user. */
export type PortalFailureReason =
  | 'NOT_CONFIGURED'
  | 'NO_SUBSCRIPTION'
  | 'NO_CUSTOMER'
  | 'STRIPE_ERROR';

export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: PortalFailureReason; message: string };

export class SubscriptionService {
  private subscriptionRepository: SubscriptionRepository;
  private stripeClient: Stripe | null = null;

  constructor() {
    this.subscriptionRepository = new SubscriptionRepository();
  }

  /**
   * The Stripe API client, or `null` when `STRIPE_SECRET_KEY` is absent.
   *
   * `STRIPE_SECRET_KEY` is server-only and must never reach the client bundle,
   * which is why the client-side `isStripeConfigured()` reads a separate
   * `NEXT_PUBLIC_STRIPE_ENABLED` flag rather than testing for the key itself.
   */
  private getStripe(): Stripe | null {
    if (this.stripeClient) return this.stripeClient;
    const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!apiKey) return null;
    this.stripeClient = new Stripe(apiKey);
    return this.stripeClient;
  }

  /**
   * Resolve the caller's subscription, defaulting to the free tier when no row
   * exists. Never throws for a missing subscription — absence *is* the free
   * plan.
   */
  async getSubscription(userId: UserId): Promise<SubscriptionView> {
    const row = await this.subscriptionRepository.findByUserId(userId);

    if (!row) {
      return {
        plan: 'FREE',
        status: 'ACTIVE',
        // A free account has no billing period; report a nominal one so the UI
        // has something to format.
        currentPeriodStart: new Date(0).toISOString(),
        currentPeriodEnd: new Date(0).toISOString(),
        cancelAtPeriodEnd: false,
        isActive: true,
        isFreeTier: true,
      };
    }

    return {
      plan: row.plan,
      status: row.status,
      currentPeriodStart: row.currentPeriodStart.toISOString(),
      currentPeriodEnd: row.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      isActive: row.status === 'ACTIVE',
      isFreeTier: row.plan === 'FREE',
    };
  }

  /**
   * Create a Stripe customer-portal session and return its URL.
   *
   * The settings pages shipped a permanently-disabled "Manage subscription"
   * button with only a tooltip explaining it opened the Stripe portal, and the
   * tooltip was the whole feature. Stripe's portal is a *hosted page* reached
   * via a short-lived session created server-side, so the app cannot link to it
   * directly — this is the missing half.
   *
   * The Stripe customer id is read from the caller's own database row and is
   * never taken from the request. Accepting one from the client would let any
   * signed-in user open the billing portal of an arbitrary customer.
   */
  async createPortalSession(
    userId: UserId,
    returnUrl: string
  ): Promise<PortalResult> {
    const stripe = this.getStripe();
    if (!stripe) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        message: 'Billing is not configured for this environment.',
      };
    }

    const row = await this.subscriptionRepository.findByUserId(userId);
    if (!row) {
      return {
        ok: false,
        reason: 'NO_SUBSCRIPTION',
        message: 'This account has no billing history yet.',
      };
    }

    if (!row.stripeCustomerId) {
      // A row can exist without a customer id if the webhook that created it
      // omitted `customer`. Say so plainly rather than failing inside Stripe.
      return {
        ok: false,
        reason: 'NO_CUSTOMER',
        message:
          'No Stripe customer is linked to this account. Contact support to have it fixed.',
      };
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: row.stripeCustomerId,
        return_url: returnUrl,
      });
      return { ok: true, url: session.url };
    } catch (error) {
      console.error('Failed to create Stripe portal session:', error);
      return {
        ok: false,
        reason: 'STRIPE_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Could not open the billing portal.',
      };
    }
  }
}

export const subscriptionService = new SubscriptionService();
