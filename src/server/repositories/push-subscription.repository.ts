import type { PushSubscription, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Push Subscription Repository
 * Database operations for the PushSubscription model, always scoped by userId
 */

export interface CreatePushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceName?: string;
  deviceType?: Prisma.PushSubscriptionCreateInput['deviceType'];
}

export class PushSubscriptionRepository extends BaseRepository {
  /**
   * Create a push subscription for the user, refreshing a duplicate endpoint
   * so re-subscribing the same device updates its keys instead of failing.
   */
  async create(
    userId: string,
    data: CreatePushSubscriptionData
  ): Promise<PushSubscription> {
    try {
      return await this.prisma.pushSubscription.upsert({
        where: { endpoint: data.endpoint },
        create: {
          userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          isActive: true,
        },
        update: {
          userId,
          p256dh: data.p256dh,
          auth: data.auth,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * List push subscriptions for a user
   */
  async findAll(userId: string): Promise<PushSubscription[]> {
    try {
      return await this.prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find a push subscription owned by the user
   */
  async findById(userId: string, subscriptionId: string): Promise<PushSubscription | null> {
    try {
      return await this.prisma.pushSubscription.findFirst({
        where: { id: subscriptionId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Delete a push subscription owned by the user
   */
  async delete(userId: string, subscriptionId: string): Promise<PushSubscription> {
    try {
      return await this.prisma.pushSubscription.delete({
        where: { id: subscriptionId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}