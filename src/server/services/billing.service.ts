import { subscriptionRepository } from '@/server/repositories/subscription.repository';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type { SubscriptionPlan, SubscriptionStatus } from '@/generated/prisma';
import { toUserId } from '@/types/ids';

/**
 * Billing Service
 *
 * Subscription state transitions driven by Stripe webhooks.
 *
 * The route's job is to verify the signature and reject anything unverified — that
 * is transport-level and must stay at the boundary. Everything after that is
 * domain: mapping Stripe's vocabulary onto ours, defaulting a missing period, and
 * deciding **which user** a subscription belongs to.
 *
 * That last part is the one worth a service. The webhook carries no session and no
 * user id of its own, so the owner is resolved from the object's metadata and
 * falls back to the existing row. Getting it wrong is not a partial failure: the
 * upsert is keyed on the user, so a wrong resolution silently overwrites another
 * account's plan.
 */

/** Stripe's status vocabulary → ours. */
const SUBSCRIPTION_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELLED',
  unpaid: 'UNPAID',
};

/** Price metadata `plan` value → our plan enum. */
const SUBSCRIPTION_PLAN_MAP: Record<string, SubscriptionPlan> = {
  free: 'FREE',
  pro: 'PRO',
  premium: 'PREMIUM',
  enterprise: 'ENTERPRISE',
};

/** Fallback period length when Stripe omits `current_period_end`. */
const MONTH_SECONDS = 30 * 24 * 60 * 60;

/** The subset of Stripe's subscription object this handler reads. */
export interface StripeSubscriptionPayload {
  id?: string;
  customer?: string;
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: { userId?: string };
  items?: {
    data?: Array<{
      price?: { metadata?: { plan?: string } };
    }>;
  };
}

export class BillingService {
  /**
   * Map Stripe's status string onto ours.
   *
   * @returns `null` for a status this app does not model, so the caller can
   * reject the event rather than write a status the Prisma enum cannot hold.
   */
  static mapStatus(stripeStatus: string | undefined): SubscriptionStatus | null {
    if (!stripeStatus) return null;
    return SUBSCRIPTION_STATUS_MAP[stripeStatus] ?? null;
  }

  /** Map the price metadata `plan` value, defaulting to PRO. */
  static mapPlan(planName: string | undefined): SubscriptionPlan {
    if (!planName) return 'PRO';
    return SUBSCRIPTION_PLAN_MAP[planName] ?? 'PRO';
  }

  /**
   * Persist a verified subscription event.
   *
   * @param stripeSubscriptionId the subscription's id, used to recover the
   * owning user when the event carries no metadata.
   * @returns the resolved user id.
   * @throws `NotFoundError` when the owner cannot be determined — the caller
   * answers 400, because retrying will not help.
   */
  async applySubscriptionEvent(
    stripeSubscriptionId: string,
    object: StripeSubscriptionPayload
  ): Promise<string> {
    const status = BillingService.mapStatus(object.status);
    if (!status) {
      throw new ValidationError('Unsupported subscription status');
    }

    const planName = object.items?.data?.[0]?.price?.metadata?.plan;
    const startSec = object.current_period_start ?? Math.floor(Date.now() / 1000);
    const endSec = object.current_period_end ?? startSec + MONTH_SECONDS;

    // Prefer the metadata carried on the Stripe object, then fall back to the
    // existing row. Both are needed: a checkout completion carries metadata,
    // while a later renewal often does not.
    let targetUserId = object.metadata?.userId ?? null;
    if (!targetUserId) {
      const existing =
        await subscriptionRepository.findByStripeSubscriptionId(
          stripeSubscriptionId
        );
      targetUserId = existing?.userId ?? null;
    }
    if (!targetUserId) {
      throw new NotFoundError('Subscription owner');
    }

    await subscriptionRepository.upsertByUserId(toUserId(targetUserId), {
      plan: BillingService.mapPlan(planName),
      status,
      currentPeriodStart: new Date(startSec * 1000),
      currentPeriodEnd: new Date(endSec * 1000),
      cancelAtPeriodEnd: object.cancel_at_period_end ?? false,
      stripeCustomerId: object.customer ?? null,
      stripeSubscriptionId,
    });

    return targetUserId;
  }
}

export const billingService = new BillingService();
