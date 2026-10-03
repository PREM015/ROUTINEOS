import { SocialRepository, type ConnectionUser } from '@/server/repositories/social.repository';
import { UserRepository } from '@/server/repositories/user.repository';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type { User } from '@/generated/prisma';
import { toUserId, type UserId } from '@/types/ids';

/**
 * Social Service
 *
 * Owns the follow-graph rules that used to be spread across the five
 * `/api/social` routes (ERROR.md §1): the self-follow prohibition, the target
 * user existence check, and the already-following / not-following states.
 *
 * It also fixes a query-shape problem that only became visible once the
 * per-route logic was in one place. `GET /api/social/followers` called
 * `isFollowing(viewer, follower.id)` **once per row**, and `following` did the
 * mirror of that — so a user with 200 connections issued 201 queries to render one
 * list. Both directions are now derived from the *other* list, which is a single
 * query each, so the whole endpoint is 2 queries regardless of fan-out.
 */
export class SocialService {
  private readonly socialRepository: SocialRepository;
  private readonly userRepository: UserRepository;

  constructor(
    socialRepository: SocialRepository = new SocialRepository(),
    userRepository: UserRepository = new UserRepository()
  ) {
    this.socialRepository = socialRepository;
    this.userRepository = userRepository;
  }

  /**
   * Follow a user.
   *
   * Self-follow is rejected here rather than in the route: it is a property of
   * the relationship, not of the HTTP verb, so it holds for every caller.
   */
  async follow(userId: UserId, targetId: string) {
    if (userId === targetId) {
      throw new ValidationError('You cannot follow yourself');
    }

    const target = await this.userRepository.findById(toUserId(targetId));
    if (!target) {
      throw new NotFoundError('User');
    }

    const result = await this.socialRepository.follow(userId, targetId);
    if (!result.created) {
      throw new ConflictError('You are already following this user');
    }

    return result;
  }

  /**
   * Unfollow a user.
   *
   * `NotFoundError` (404) rather than a conflict: the subject of the statement
   * is the caller's own follow row, and there is nothing to conflict with.
   */
  async unfollow(userId: UserId, targetId: string) {
    if (userId === targetId) {
      throw new ValidationError('You cannot unfollow yourself');
    }

    const following = await this.socialRepository.isFollowing(userId, targetId);
    if (!following) {
      throw new NotFoundError('Follow relationship');
    }

    await this.socialRepository.unfollow(userId, targetId);
    return { unfollowed: true as const };
  }

  /**
   * The caller's followers, each annotated with whether the caller follows them
   * back.
   *
   * `isMutual` is resolved by intersecting with the caller's own following list
   * rather than by asking per row.
   */
  async followers(userId: UserId) {
    const [followers, following] = await Promise.all([
      this.socialRepository.followers(userId),
      this.socialRepository.following(userId),
    ]);

    const followingIds = new Set(following.map((user) => user.id));

    return followers.map((follower) => ({
      ...follower,
      isMutual: followingIds.has(follower.id),
    }));
  }

  /** The caller's following list, each annotated with whether it follows back. */
  async following(userId: UserId) {
    const [following, followers] = await Promise.all([
      this.socialRepository.following(userId),
      this.socialRepository.followers(userId),
    ]);

    const followerIds = new Set(followers.map((user) => user.id));

    return following.map((user) => ({
      ...user,
      isMutual: followerIds.has(user.id),
    }));
  }

  /**
   * Mutual connections plus suggested users.
   *
   * Fetches both in parallel — they are independent reads — and drops the
   * viewer from the suggestions. A viewer appearing in their own suggestion list
   * is the kind of small wrongness that reads as a bug in the whole feature.
   */
  async connections(userId: UserId) {
    const [mutual, suggestions] = await Promise.all([
      this.socialRepository.mutualConnections(userId),
      this.socialRepository.suggestions(userId),
    ]);

    return {
      mutual,
      suggestions: suggestions.filter((user) => user.id !== userId),
    };
  }

  /** Whether the caller follows the given user. */
  async isFollowing(userId: UserId, otherUserId: string): Promise<boolean> {
    return this.socialRepository.isFollowing(userId, otherUserId);
  }

  /** Users the caller does not yet follow. */
  async suggestions(userId: UserId): Promise<User[]> {
    return this.socialRepository.suggestions(userId);
  }
}

export type { ConnectionUser };
export const socialService = new SocialService();
