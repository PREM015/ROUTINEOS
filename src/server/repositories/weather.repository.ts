import type { WeatherLog, WeatherCondition, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Weather Repository
 * Database operations for the WeatherLog model
 */

export interface CreateWeatherData {
  date: string;
  condition: WeatherCondition;
  temperature?: number;
  humidity?: number;
  notes?: string;
}

export interface WeatherQueryParams {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class WeatherRepository extends BaseRepository {
  /**
   * Create or update a weather log (one per user per date)
   */
  async upsert(userId: string, data: CreateWeatherData): Promise<WeatherLog> {
    try {
      return await this.prisma.weatherLog.upsert({
        where: { userId_date: { userId, date: data.date } },
        create: {
          userId,
          date: data.date,
          condition: data.condition,
          temperature: data.temperature,
          humidity: data.humidity,
          notes: data.notes,
        },
        update: {
          condition: data.condition,
          temperature: data.temperature,
          humidity: data.humidity,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'upsert');
    }
  }

  /**
   * Find weather logs for a user with optional date range and pagination
   */
  async findByUserId(userId: string, query: WeatherQueryParams = {}): Promise<WeatherLog[]> {
    try {
      const where: Prisma.WeatherLogWhereInput = { userId };

      if (query.startDate || query.endDate) {
        where.date = {};
        if (query.startDate) where.date.gte = query.startDate;
        if (query.endDate) where.date.lte = query.endDate;
      }

      return await this.prisma.weatherLog.findMany({
        where,
        orderBy: { date: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Get weather logs within a date range, oldest first
   */
  async findByRange(userId: string, startDate: string, endDate: string): Promise<WeatherLog[]> {
    try {
      return await this.prisma.weatherLog.findMany({
        where: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'findByRange');
    }
  }

  /**
   * Find a single weather log owned by the user
   */
  async findById(userId: string, logId: string): Promise<WeatherLog | null> {
    try {
      return await this.prisma.weatherLog.findFirst({
        where: { id: logId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Get a weather log for a specific date
   */
  async findByDate(userId: string, date: string): Promise<WeatherLog | null> {
    try {
      return await this.prisma.weatherLog.findFirst({
        where: { userId, date },
      });
    } catch (error) {
      this.handleError(error, 'findByDate');
    }
  }

  /**
   * Update a weather log owned by the user
   */
  async update(
    userId: string,
    logId: string,
    data: Partial<CreateWeatherData>
  ): Promise<WeatherLog> {
    try {
      return await this.prisma.weatherLog.update({
        where: { id: logId, userId },
        data: {
          condition: data.condition,
          temperature: data.temperature,
          humidity: data.humidity,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'update');
    }
  }

  /**
   * Delete a weather log owned by the user
   */
  async delete(userId: string, logId: string): Promise<WeatherLog> {
    try {
      return await this.prisma.weatherLog.delete({
        where: { id: logId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}