import type { User, UserConnection } from '@prisma/client';
import { BaseRepository } from './base.repository';

/**
 * Social Repository
 * Follow/unfollow, follower, and connection queries
 */

export interface UserSummary {
  id: string;
  name: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface ConnectionUser extends UserSummary {
  followedAt: Date;
}

export interface FollowResult {
  connection: UserConnection;
  created: boolean;
}

const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
} as const;

export class SocialRepository extends BaseRepository {
  async follow(followerId: string, followingId: string): Promise<FollowResult> {
    try {
      if (!followerId || !followingId) {
        this.handleError(new Error('followerId and followingId are required'), 'follow');
      }
      const existing = await this.prisma.userConnection.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      });
      if (existing) return { connection: existing, created: false };

      const connection = await this.prisma.userConnection.create({
        data: { followerId, followingId },
      });
      return { connection, created: true };
    } catch (error) {
      this.handleError(error, 'follow');
    }
  }

  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    try {
      const result = await this.prisma.userConnection.deleteMany({
        where: { followerId, followingId },
      });
      return result.count > 0;
    } catch (error) {
      this.handleError(error, 'unfollow');
    }
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      const count = await this.prisma.userConnection.count({
        where: { followerId, followingId },
      });
      return count > 0;
    } catch (error) {
      this.handleError(error, 'isFollowing');
    }
  }

  async followers(userId: string): Promise<ConnectionUser[]> {
    try {
      const rows = await this.prisma.userConnection.findMany({
        where: { followingId: userId },
        include: { follower: { select: USER_SUMMARY_SELECT } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => ({
        ...row.follower,
        followedAt: row.createdAt,
      }));
    } catch (error) {
      this.handleError(error, 'followers');
    }
  }

  async following(userId: string): Promise<ConnectionUser[]> {
    try {
      const rows = await this.prisma.userConnection.findMany({
        where: { followerId: userId },
        include: { following: { select: USER_SUMMARY_SELECT } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => ({
        ...row.following,
        followedAt: row.createdAt,
      }));
    } catch (error) {
      this.handleError(error, 'following');
    }
  }

  async mutualConnections(userId: string): Promise<ConnectionUser[]> {
    try {
      const followingRows = await this.prisma.userConnection.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const followingIds = followingRows.map((row) => row.followingId);

      if (followingIds.length === 0) return [];

      const mutualRows = await this.prisma.userConnection.findMany({
        where: { followerId: { in: followingIds }, followingId: userId },
        include: { follower: { select: USER_SUMMARY_SELECT } },
        orderBy: { createdAt: 'desc' },
      });
      return mutualRows.map((row) => ({
        ...row.follower,
        followedAt: row.createdAt,
      }));
    } catch (error) {
      this.handleError(error, 'mutualConnections');
    }
  }

  async followBack(userId: string, otherUserId: string): Promise<boolean> {
    try {
      if (userId === otherUserId) return false;
      const theyFollowYou = await this.prisma.userConnection.findUnique({
        where: { followerId_followingId: { followerId: otherUserId, followingId: userId } },
      });
      if (!theyFollowYou) return false;
      await this.follow(userId, otherUserId);
      return true;
    } catch (error) {
      this.handleError(error, 'followBack');
    }
  }

  async suggestions(userId: string): Promise<User[]> {
    try {
      const followingRows = await this.prisma.userConnection.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      });
      const followingIds = followingRows.map((row) => row.followingId);

      return await this.prisma.user.findMany({
        where: {
          id: { notIn: [...followingIds, userId] },
          isActive: true,
          isDeleted: false,
        },
        orderBy: { lastActivityAt: 'desc' },
        take: 10,
      });
    } catch (error) {
      this.handleError(error, 'suggestions');
    }
  }
}