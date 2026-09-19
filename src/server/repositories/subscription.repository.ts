import type { UserSubscription } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Subscription Repository
 * Upsert / read the UserSubscription row for a user.
 */

export interface UpsertSubscriptionData {
  plan: UserSubscription['plan'];
  status: UserSubscription['status'];
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export class SubscriptionRepository extends BaseRepository {
  /**
   * Find the subscription for a user (may be null for free-tier accounts)
   */
  async findByUserId(userId: string): Promise<UserSubscription | null> {
    try {
      return await this.prisma.userSubscription.findUnique({
        where: { userId },
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Upsert a subscription row for a user (creates if absent, updates if present)
   */
  async upsertByUserId(
    userId: string,
    data: UpsertSubscriptionData
  ): Promise<UserSubscription> {
    try {
      return await this.prisma.userSubscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: data.plan,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          stripeCustomerId: data.stripeCustomerId ?? null,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
        },
        update: {
          plan: data.plan,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          stripeCustomerId: data.stripeCustomerId ?? undefined,
          stripeSubscriptionId: data.stripeSubscriptionId ?? undefined,
        },
      });
    } catch (error) {
      this.handleError(error, 'upsertByUserId');
    }
  }

  /**
   * Mark a subscription as cancelled
   */
  async markCancelled(userId: string): Promise<UserSubscription> {
    try {
      return await this.prisma.userSubscription.update({
        where: { userId },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
      });
    } catch (error) {
      this.handleError(error, 'markCancelled');
    }
  }

  /**
   * Find a subscription by Stripe subscription ID (for webhook lookups)
   */
  async findByStripeSubscriptionId(
    stripeSubscriptionId: string
  ): Promise<UserSubscription | null> {
    try {
      return await this.prisma.userSubscription.findFirst({
        where: { stripeSubscriptionId },
      });
    } catch (error) {
      this.handleError(error, 'findByStripeSubscriptionId');
    }
  }
}

export const subscriptionRepository = new SubscriptionRepository();
