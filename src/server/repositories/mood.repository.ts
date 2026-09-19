import type { MoodLog, EnergyLog, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Mood Repository
 * Database operations for MoodLog and EnergyLog models
 */

type DateFilter = Date | string;

interface LogMoodData {
  timestamp?: Date;
  mood: number;
  energy?: number;
  stress?: number;
  anxiety?: number;
  focus?: number;
  triggers?: string[];
  activities?: string[];
  location?: string;
  weather?: string;
  notes?: string;
}

interface UpdateMoodData {
  mood?: number;
  energy?: number | null;
  stress?: number | null;
  anxiety?: number | null;
  focus?: number | null;
  triggers?: string[];
  activities?: string[];
  location?: string | null;
  weather?: string | null;
  notes?: string | null;
}

interface LogEnergyData {
  timestamp?: Date;
  energyLevel: number;
  activity?: string;
  location?: string;
  notes?: string;
}

interface LogQueryParams {
  from?: DateFilter;
  to?: DateFilter;
  limit?: number;
  offset?: number;
}

interface MoodStats {
  totalLogs: number;
  averageMood: number;
  averageEnergy: number;
  averageStress: number;
  averageAnxiety: number;
  averageFocus: number;
}

function toLogDate(value?: DateFilter): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' ? new Date(value) : value;
}

export class MoodRepository extends BaseRepository {
  /**
   * Log a mood entry
   */
  async logMood(userId: string, data: LogMoodData): Promise<MoodLog> {
    try {
      return await this.prisma.moodLog.create({
        data: {
          userId,
          timestamp: data.timestamp,
          mood: data.mood,
          energy: data.energy,
          stress: data.stress,
          anxiety: data.anxiety,
          focus: data.focus,
          triggers: data.triggers
            ? JSON.stringify(data.triggers)
            : undefined,
          activities: data.activities
            ? JSON.stringify(data.activities)
            : undefined,
          location: data.location,
          weather: data.weather,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'logMood');
    }
  }

  /**
   * Log an energy entry
   */
  async logEnergy(userId: string, data: LogEnergyData): Promise<EnergyLog> {
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
      this.handleError(error, 'logEnergy');
    }
  }

  /**
   * Find a mood log by ID with ownership check
   */
  async findById(userId: string, logId: string): Promise<MoodLog | null> {
    try {
      return await this.prisma.moodLog.findFirst({
        where: { id: logId, userId },
      });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  /**
   * Find mood logs for a user with optional filters
   */
  async findByUserId(
    userId: string,
    query: LogQueryParams = {}
  ): Promise<MoodLog[]> {
    try {
      const where: Prisma.MoodLogWhereInput = { userId };

      const from = toLogDate(query.from);
      const to = toLogDate(query.to);
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = from;
        if (to) where.timestamp.lte = to;
      }

      return await this.prisma.moodLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  /**
   * Find energy logs for a user with optional filters
   */
  async findEnergyByUserId(
    userId: string,
    query: LogQueryParams = {}
  ): Promise<EnergyLog[]> {
    try {
      const where: Prisma.EnergyLogWhereInput = { userId };

      const from = toLogDate(query.from);
      const to = toLogDate(query.to);
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
      this.handleError(error, 'findEnergyByUserId');
    }
  }

  /**
   * Update a mood log owned by the user
   */
  async updateMood(
    userId: string,
    logId: string,
    data: UpdateMoodData
  ): Promise<MoodLog> {
    try {
      return await this.prisma.moodLog.update({
        where: { id: logId, userId },
        data: {
          mood: data.mood,
          energy: data.energy,
          stress: data.stress,
          anxiety: data.anxiety,
          focus: data.focus,
          triggers: data.triggers
            ? JSON.stringify(data.triggers)
            : undefined,
          activities: data.activities
            ? JSON.stringify(data.activities)
            : undefined,
          location: data.location,
          weather: data.weather,
          notes: data.notes,
        },
      });
    } catch (error) {
      this.handleError(error, 'updateMood');
    }
  }

  /**
   * Delete a mood log owned by the user
   */
  async delete(userId: string, logId: string): Promise<MoodLog> {
    try {
      return await this.prisma.moodLog.delete({
        where: { id: logId, userId },
      });
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }

  /**
   * Get mood logs within a date range
   */
  async getMoodRange(
    userId: string,
    from?: DateFilter,
    to?: DateFilter
  ): Promise<MoodLog[]> {
    try {
      const where: Prisma.MoodLogWhereInput = { userId };

      const fromDate = toLogDate(from);
      const toDate = toLogDate(to);
      if (fromDate || toDate) {
        where.timestamp = {};
        if (fromDate) where.timestamp.gte = fromDate;
        if (toDate) where.timestamp.lte = toDate;
      }

      return await this.prisma.moodLog.findMany({
        where,
        orderBy: { timestamp: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getMoodRange');
    }
  }

  /**
   * Get energy logs within a date range
   */
  async getEnergyRange(
    userId: string,
    from?: DateFilter,
    to?: DateFilter
  ): Promise<EnergyLog[]> {
    try {
      const where: Prisma.EnergyLogWhereInput = { userId };

      const fromDate = toLogDate(from);
      const toDate = toLogDate(to);
      if (fromDate || toDate) {
        where.timestamp = {};
        if (fromDate) where.timestamp.gte = fromDate;
        if (toDate) where.timestamp.lte = toDate;
      }

      return await this.prisma.energyLog.findMany({
        where,
        orderBy: { timestamp: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'getEnergyRange');
    }
  }

  /**
   * Get the latest mood log for a user
   */
  async latestMood(userId: string): Promise<MoodLog | null> {
    try {
      return await this.prisma.moodLog.findFirst({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'latestMood');
    }
  }

  /**
   * Get the latest energy log for a user
   */
  async latestEnergy(userId: string): Promise<EnergyLog | null> {
    try {
      return await this.prisma.energyLog.findFirst({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'latestEnergy');
    }
  }

  /**
   * Get aggregate mood and energy stats for a user in a date range
   */
  async getStats(
    userId: string,
    from?: DateFilter,
    to?: DateFilter
  ): Promise<MoodStats> {
    try {
      const where: Prisma.MoodLogWhereInput = { userId };

      const fromDate = toLogDate(from);
      const toDate = toLogDate(to);
      if (fromDate || toDate) {
        where.timestamp = {};
        if (fromDate) where.timestamp.gte = fromDate;
        if (toDate) where.timestamp.lte = toDate;
      }

      const result = await this.prisma.moodLog.aggregate({
        where,
        _count: true,
        _avg: {
          mood: true,
          energy: true,
          stress: true,
          anxiety: true,
          focus: true,
        },
      });

      return {
        totalLogs: result._count,
        averageMood: result._avg.mood || 0,
        averageEnergy: result._avg.energy || 0,
        averageStress: result._avg.stress || 0,
        averageAnxiety: result._avg.anxiety || 0,
        averageFocus: result._avg.focus || 0,
      };
    } catch (error) {
      this.handleError(error, 'getStats');
    }
  }
}