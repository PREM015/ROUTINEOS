import type { EnergyLog, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Energy Repository
 * Database operations for the EnergyLog model
 */

export interface CreateEnergyData {
  timestamp?: Date;
  energyLevel: number;
  activity?: string;
  location?: string;
  notes?: string;
}

export interface EnergyQueryParams {
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  offset?: number;
}

function toDate(value?: Date | string): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

export class EnergyRepository extends BaseRepository {
  /**
   * Create an energy check-in for a user
   */
  async create(userId: string, data: CreateEnergyData): Promise<EnergyLog> {
    try {
      return await this.prisma.energyLog.create({
        data: {
          userId,
          timestamp: data.timestamp,
          energyLevel: data.energyLevel,
          activity: data.activity,
          location: data.location,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find energy logs for a user with optional date range and pagination
   */
  async findByUserId(userId: string, query: EnergyQueryParams = {}): Promise<EnergyLog[]> {
    try {
      const where: Prisma.EnergyLogWhereInput = { userId };

      const from = toDate(query.from);
      const to = toDate(query.to);
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = from;
        if (to) where.timestamp.lte = to;
      }

      return await this.prisma.energyLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Get energy logs within a date range, oldest first
   */
  async getRange(userId: string, from?: Date | string, to?: Date | string): Promise<EnergyLog[]> {
    try {
      const where: Prisma.EnergyLogWhereInput = { userId };

      const fromDate = toDate(from);
      const toDateValue = toDate(to);
      if (fromDate || toDateValue) {
        where.timestamp = {};
        if (fromDate) where.timestamp.gte = fromDate;
        if (toDateValue) where.timestamp.lte = toDateValue;
      }

      return await this.prisma.energyLog.findMany({
        where,
        orderBy: { timestamp: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getRange');
    }
  }

  /**
   * Find a single energy log owned by the user
   */
  async findById(userId: string, logId: string): Promise<EnergyLog | null> {
    try {
      return await this.prisma.energyLog.findFirst({
        where: { id: logId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Get the latest energy log for a user
   */
  async findLatest(userId: string): Promise<EnergyLog | null> {
    try {
      return await this.prisma.energyLog.findFirst({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'findLatest');
    }
  }

  /**
   * Update an energy log owned by the user
   */
  async update(
    userId: string,
    logId: string,
    data: Partial<CreateEnergyData>
  ): Promise<EnergyLog> {
    try {
      return await this.prisma.energyLog.update({
        where: { id: logId, userId },
        data: {
          timestamp: data.timestamp,
          energyLevel: data.energyLevel,
          activity: data.activity,
          location: data.location,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete an energy log owned by the user
   */
  async delete(userId: string, logId: string): Promise<EnergyLog> {
    try {
      return await this.prisma.energyLog.delete({
        where: { id: logId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}