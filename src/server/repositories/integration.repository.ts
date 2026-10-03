import type { Integration, IntegrationProvider } from '@/generated/prisma';
import { BaseRepository } from './base.repository';
import type { UserId } from '@/types/ids';

/**
 * Integration Repository
 * Database operations for Integration model
 */

interface IntegrationTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

export class IntegrationRepository extends BaseRepository {
  /**
   * Find all integrations for a user
   */
  async findAll(userId: UserId): Promise<Integration[]> {
    try {
      return await this.prisma.integration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find an integration by provider for a user
   */
  async findByProvider(
    userId: UserId,
    provider: IntegrationProvider
  ): Promise<Integration | null> {
    try {
      return await this.prisma.integration.findFirst({
        where: { userId, provider },
      });
    } catch (error) {
      this.handleError(error, 'findByProvider');
    }
  }

  /**
   * Find an integration by ID with ownership check
   */
  async findById(
    userId: UserId,
    integrationId: string
  ): Promise<Integration | null> {
    try {
      return await this.prisma.integration.findFirst({
        where: { id: integrationId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Connect a provider for a user, creating or updating the integration
   */
  async connect(
    userId: UserId,
    provider: IntegrationProvider,
    tokens: IntegrationTokens
  ): Promise<Integration> {
    try {
      return await this.prisma.integration.upsert({
        where: {
          userId_provider: { userId, provider },
        },
        create: {
          userId,
          provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          isActive: true,
        },
        update: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
          isActive: true,
          syncError: null,
        },
      });
    } catch (error) {
      this.handleError(error, 'connect');
    }
  }

  /**
   * Update access tokens for an integration
   */
  async updateTokens(
    userId: UserId,
    integrationId: string,
    tokens: Partial<IntegrationTokens>
  ): Promise<Integration> {
    try {
      return await this.prisma.integration.update({
        where: { id: integrationId, userId },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
      });
    } catch (error) {
      this.handleError(error, 'updateTokens');
    }
  }

  /**
   * Deactivate an integration for a user
   */
  async disconnect(userId: UserId, integrationId: string): Promise<Integration> {
    try {
      return await this.prisma.integration.update({
        where: { id: integrationId, userId },
        data: { isActive: false },
      });
    } catch (error) {
      this.handleError(error, 'disconnect');
    }
  }

  /**
   * Update the active status of an integration
   */
  async updateStatus(
    userId: UserId,
    integrationId: string,
    status: boolean
  ): Promise<Integration> {
    try {
      return await this.prisma.integration.update({
        where: { id: integrationId, userId },
        data: { isActive: status },
      });
    } catch (error) {
      this.handleError(error, 'updateStatus');
    }
  }

  /**
   * Find all connections for a provider across users
   */
  async findByProviderConnections(provider: IntegrationProvider) {
    try {
      return await this.prisma.integration.findMany({
        where: { provider },
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findByProviderConnections');
    }
  }
}
