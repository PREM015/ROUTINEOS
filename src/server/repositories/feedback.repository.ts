import type { Feedback, FeedbackStatus, FeedbackType, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Feedback Repository
 * CRUD operations for user feedback
 */

export interface CreateFeedbackData {
  type: FeedbackType;
  subject: string;
  message: string;
  email?: string;
}

export interface FeedbackQuery {
  type?: FeedbackType;
  status?: FeedbackStatus;
  limit?: number;
  offset?: number;
}

export interface FeedbackListItem {
  id: string;
  type: FeedbackType;
  subject: string;
  message: string;
  email: string | null;
  status: FeedbackStatus;
  priority: string;
  resolvedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
  } | null;
}

export class FeedbackRepository extends BaseRepository {
  async createFeedback(userId: string | null, data: CreateFeedbackData): Promise<Feedback> {
    try {
      return await this.prisma.feedback.create({
        data: {
          type: data.type,
          subject: data.subject,
          message: data.message,
          email: data.email,
          ...(userId ? { user: { connect: { id: userId } } } : {}),
        },
      });
    } catch (error) {
      this.handleError(error, 'createFeedback');
    }
  }

  async findById(id: string): Promise<Feedback | null> {
    try {
      return await this.prisma.feedback.findUnique({ where: { id } });
    } catch (error) {
      this.handleError(error, 'findById');
    }
  }

  async findByUserId(userId: string, query: FeedbackQuery = {}): Promise<Feedback[]> {
    try {
      return await this.prisma.feedback.findMany({
        where: {
          userId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.type ? { type: query.type } : {}),
        },
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findByUserId');
    }
  }

  async countByUserId(userId: string, query: FeedbackQuery = {}): Promise<number> {
    try {
      return await this.prisma.feedback.count({
        where: {
          userId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.type ? { type: query.type } : {}),
        },
      });
    } catch (error) {
      this.handleError(error, 'countByUserId');
    }
  }

  async findAllPaginated(query: FeedbackQuery = {}): Promise<FeedbackListItem[]> {
    try {
      const where: Prisma.FeedbackWhereInput = {};
      if (query.status) where.status = query.status;
      if (query.type) where.type = query.type;

      return await this.prisma.feedback.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...this.buildPaginationQuery(query.limit, query.offset),
      });
    } catch (error) {
      this.handleError(error, 'findAllPaginated');
    }
  }

  async count(query: FeedbackQuery = {}): Promise<number> {
    try {
      const where: Prisma.FeedbackWhereInput = {};
      if (query.status) where.status = query.status;
      if (query.type) where.type = query.type;
      return await this.prisma.feedback.count({ where });
    } catch (error) {
      this.handleError(error, 'count');
    }
  }

  async updateStatus(id: string, status: FeedbackStatus): Promise<Feedback> {
    try {
      return await this.prisma.feedback.update({
        where: { id },
        data: {
          status,
          resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : null,
        },
      });
    } catch (error) {
      this.handleError(error, 'updateStatus');
    }
  }

  async updateOwn(
    id: string,
    userId: string,
    data: Prisma.FeedbackUpdateInput
  ): Promise<Feedback | null> {
    try {
      const existing = await this.prisma.feedback.findFirst({ where: { id, userId } });
      if (!existing) return null;
      return await this.prisma.feedback.update({ where: { id }, data });
    } catch (error) {
      this.handleError(error, 'updateOwn');
    }
  }
}