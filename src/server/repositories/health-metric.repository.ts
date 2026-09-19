import type { HealthMetric, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Health Metric Repository
 * Database operations for the HealthMetric model
 */

export interface CreateHealthMetricData {
  date: string;
  metricType: string;
  value: number;
  unit: string;
  timeOfDay?: string;
  notes?: string;
  source?: string;
  sourceId?: string;
}

export interface HealthMetricQueryParams {
  startDate?: string;
  endDate?: string;
  metricType?: string;
  timeOfDay?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export class HealthMetricRepository extends BaseRepository {
  /**
   * Create a health metric entry
   */
  async create(userId: string, data: CreateHealthMetricData): Promise<HealthMetric> {
    try {
      return await this.prisma.healthMetric.create({
        data: {
          userId,
          date: data.date,
          metricType: data.metricType,
          value: data.value,
          unit: data.unit,
          timeOfDay: data.timeOfDay,
          notes: data.notes,
          source: data.source,
          sourceId: data.sourceId,
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  /**
   * Find health metrics for a user with optional filters
   */
  async findAll(userId: string, query: HealthMetricQueryParams = {}): Promise<HealthMetric[]> {
    try {
      const where: Prisma.HealthMetricWhereInput = { userId };

      if (query.startDate || query.endDate) {
        where.date = {};
        if (query.startDate) where.date.gte = query.startDate;
        if (query.endDate) where.date.lte = query.endDate;
      }

      if (query.metricType) where.metricType = query.metricType;
      if (query.timeOfDay) where.timeOfDay = query.timeOfDay;
      if (query.source) where.source = query.source;

      return await this.prisma.healthMetric.findMany({
        where,
        orderBy: { date: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAll');
    }
  }

  /**
   * Find a single health metric owned by the user
   */
  async findById(userId: string, metricId: string): Promise<HealthMetric | null> {
    try {
      return await this.prisma.healthMetric.findFirst({
        where: { id: metricId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Update a health metric owned by the user
   */
  async update(
    userId: string,
    metricId: string,
    data: Partial<CreateHealthMetricData>
  ): Promise<HealthMetric> {
    try {
      return await this.prisma.healthMetric.update({
        where: { id: metricId, userId },
        data: {
          date: data.date,
          metricType: data.metricType,
          value: data.value,
          unit: data.unit,
          timeOfDay: data.timeOfDay,
          notes: data.notes,
          source: data.source,
          sourceId: data.sourceId,
        },
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a health metric owned by the user
   */
  async delete(userId: string, metricId: string): Promise<HealthMetric> {
    try {
      return await this.prisma.healthMetric.delete({
        where: { id: metricId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}