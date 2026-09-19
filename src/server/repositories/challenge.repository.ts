import type { Challenge, ChallengeParticipant } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Challenge Repository
 * CRUD operations for challenges and participant progress
 */

export interface CreateChallengeData {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  isPublic?: boolean;
  maxMembers?: number;
  rules?: string;
  rewards?: string;
}

export interface JoinResult {
  participant: ChallengeParticipant;
  created: boolean;
}

export interface ProgressResult {
  participant: ChallengeParticipant;
  challenge: Challenge | null;
}

const CHALLENGE_INCLUDE = {
  creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
  members: {
    select: {
      id: true,
      joinedAt: true,
      progress: true,
      rank: true,
      userId: true,
      user: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { progress: 'desc' as const },
  },
} as const;

const CHALLENGE_LIST_INCLUDE = {
  creator: { select: { id: true, name: true, displayName: true, avatarUrl: true } },
  _count: { select: { members: true } },
} as const;

export class ChallengeRepository extends BaseRepository {
  async listActive(): Promise<Challenge[]> {
    try {
      const now = new Date();
      return await this.prisma.challenge.findMany({
        where: { isPublic: true, endDate: { gte: now } },
        include: CHALLENGE_LIST_INCLUDE,
        orderBy: { startDate: 'asc' },
      });
    } catch (error) {
      this.handleError(error, 'listActive');
    }
  }

  async listByUser(userId: string): Promise<Challenge[]> {
    try {
      return await this.prisma.challenge.findMany({
        where: { members: { some: { userId } } },
        include: CHALLENGE_LIST_INCLUDE,
        orderBy: { startDate: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'listByUser');
    }
  }

  async getById(challengeId: string): Promise<Challenge | null> {
    try {
      return await this.prisma.challenge.findUnique({
        where: { id: challengeId },
        include: CHALLENGE_INCLUDE,
      });
    } catch (error) {
      this.handleError(error, 'getById');
    }
  }

  async create(userId: string, data: CreateChallengeData): Promise<Challenge> {
    try {
      return await this.prisma.challenge.create({
        data: {
          title: data.title,
          description: data.description,
          startDate: data.startDate,
          endDate: data.endDate,
          isPublic: data.isPublic,
          maxMembers: data.maxMembers,
          rules: data.rules ?? '[]',
          rewards: data.rewards,
          creator: { connect: { id: userId } },
        },
      });
    } catch (error) {
      this.handleError(error, 'create');
    }
  }

  async isMember(challengeId: string, userId: string): Promise<boolean> {
    try {
      const count = await this.prisma.challengeParticipant.count({
        where: { challengeId, userId },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'isMember');
    }
  }

  async join(challengeId: string, userId: string): Promise<JoinResult> {
    try {
      const challenge = await this.prisma.challenge.findUnique({
        where: { id: challengeId },
        select: { id: true, maxMembers: true, endDate: true },
      });
      if (!challenge) {
        this.handleError(new Error(`Challenge ${challengeId} not found`), 'join');
      }
      if (challenge && challenge.endDate < new Date()) {
        this.handleError(new Error('Challenge has already ended'), 'join');
      }

      const existing = await this.prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      });
      if (existing) return { participant: existing, created: false };

      if (challenge?.maxMembers !== null && challenge?.maxMembers !== undefined) {
        const memberCount = await this.prisma.challengeParticipant.count({
          where: { challengeId },
        });
        if (memberCount >= challenge.maxMembers) {
          this.handleError(new Error('Challenge is full'), 'join');
        }
      }

      const participant = await this.prisma.challengeParticipant.create({
        data: { challengeId, userId },
      });
      return { participant, created: true };
    } catch (error) {
      this.handleError(error, 'join');
    }
  }

  async leave(challengeId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.prisma.challengeParticipant.deleteMany({
        where: { challengeId, userId },
      });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'leave');
    }
  }

  async participants(challengeId: string): Promise<ChallengeParticipant[]> {
    try {
      return await this.prisma.challengeParticipant.findMany({
        where: { challengeId },
        include: { user: { select: { id: true, name: true, displayName: true, avatarUrl: true } } },
        orderBy: { progress: 'desc' },
      });
    } catch (error) {
      this.handleError(error, 'participants');
    }
  }

  async incrementProgress(
    challengeId: string,
    userId: string,
    amount = 10
  ): Promise<ProgressResult | null> {
    try {
      const participant = await this.prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      });
      if (!participant) return null;

      const nextProgress = Math.min(100, Math.max(0, participant.progress + amount));
      const updated = await this.prisma.challengeParticipant.update({
        where: { id: participant.id },
        data: { progress: nextProgress },
      });

      const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
      return { participant: updated, challenge };
    } catch (error) {
      this.handleError(error, 'incrementProgress');
    }
  }

  async setProgress(
    challengeId: string,
    userId: string,
    progress: number
  ): Promise<ProgressResult | null> {
    try {
      const participant = await this.prisma.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      });
      if (!participant) return null;

      const nextProgress = Math.min(100, Math.max(0, progress));
      const updated = await this.prisma.challengeParticipant.update({
        where: { id: participant.id },
        data: { progress: nextProgress },
      });

      const challenge = await this.prisma.challenge.findUnique({ where: { id: challengeId } });
      return { participant: updated, challenge };
    } catch (error) {
      this.handleError(error, 'setProgress');
    }
  }

  async delete(challengeId: string, creatorId: string): Promise<boolean> {
    try {
      const result = await this.prisma.challenge.deleteMany({
        where: { id: challengeId, creatorId },
      });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'delete');
    }
  }
}