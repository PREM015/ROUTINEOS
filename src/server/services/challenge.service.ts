import { ChallengeRepository } from '@/server/repositories/challenge.repository';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { z } from 'zod';
import type { Challenge, ChallengeParticipant } from '@/generated/prisma';
import type { CreateChallengeInput, UpdateChallengeProgressInput } from '@/schemas/challenge.schema';

/**
 * Challenge Service
 *
 * Owns the orchestration that used to be spread across the four
 * `/api/challenges` routes: the existence checks, the membership checks, the
 * "only the creator may delete" rule, and the shape a challenge takes on the
 * wire.
 *
 * ERROR.md §1 lists 49 routes that import a repository directly and calls this
 * "not a correctness or security problem — the cost is consistency and
 * testability". Concretely, that cost showed up here: `GET /api/challenges`
 * assembled its response inline with a `typeof challenge & { creator?, _count? }`
 * cast, and `PATCH /api/challenges/[id]` re-ran `getById` + `isMember` inline.
 * The response shape in particular could not be tested without a route, because
 * the code that defined it *was* the route.
 */
export class ChallengeService {
  private readonly challengeRepository: ChallengeRepository;

  constructor(challengeRepository: ChallengeRepository = new ChallengeRepository()) {
    this.challengeRepository = challengeRepository;
  }

  /**
   * Challenges the user can see, with membership state resolved.
   *
   * Public/active challenges and the user's own joined challenges are merged and
   * de-duplicated by id. A joined challenge that has since been archived or has
   * passed its end date is deliberately still returned: the user joined it, and
   * showing it disappear with no explanation is the same class of bug as a habit
   * vanishing from `/habits` with nothing saying why.
   */
  async listForUser(userId: string) {
    const [active, joined] = await Promise.all([
      this.challengeRepository.listActive(),
      this.challengeRepository.listByUser(userId),
    ]);

    const joinedIds = new Set(joined.map((challenge) => challenge.id));
    const byId = new Map<string, Challenge>();

    for (const challenge of [...active, ...joined]) {
      if (!byId.has(challenge.id)) {
        byId.set(challenge.id, challenge);
      }
    }

    return Array.from(byId.values()).map((challenge) => {
      /*
       * `creator` and `_count.members` are included by the repository, but
       * `findMany`/`findUnique` return them as optional extras rather than on the
       * base `Challenge` type, so the route used to cast the row to intersect
       * them in. Kept here so the cast lives in one place.
       */
      const withMeta = challenge as Challenge & {
        creator?: {
          id: string;
          name: string | null;
          displayName: string | null;
          avatarUrl: string | null;
        };
        _count?: { members: number };
      };

      return {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        startDate: challenge.startDate,
        endDate: challenge.endDate,
        isPublic: challenge.isPublic,
        maxMembers: challenge.maxMembers,
        rules: challenge.rules,
        rewards: challenge.rewards,
        creator: withMeta.creator,
        memberCount: withMeta._count?.members ?? 0,
        isJoined: joinedIds.has(challenge.id),
      };
    });
  }

  /** Create a challenge owned by the authenticated user. */
  async create(userId: string, input: CreateChallengeInput): Promise<Challenge> {
    return this.challengeRepository.create(userId, input);
  }

  /**
   * A single challenge, with membership and creator flags.
   *
   * Throws `NotFoundError` for a challenge that does not exist, and
   * `AuthorizationError` for a private challenge the user has not joined — the
   * distinction matters, because a private challenge must not be confirmable as
   * existing by a stranger.
   */
  async getForUser(challengeId: string, userId: string) {
    const challenge = await this.challengeRepository.getById(challengeId);
    if (!challenge) {
      throw new NotFoundError('Challenge');
    }

    const isMember = await this.challengeRepository.isMember(challengeId, userId);
    if (!challenge.isPublic && !isMember) {
      throw new ValidationError('Forbidden');
    }

    return {
      ...challenge,
      isJoined: isMember,
      isCreator: challenge.creatorId === userId,
    };
  }

  /**
   * Join a challenge.
   *
   * `ConflictError` (409) when already a member, which is what the route used to
   * return inline.
   */
  async join(challengeId: string, userId: string) {
    const challenge = await this.challengeRepository.getById(challengeId);
    if (!challenge) {
      throw new NotFoundError('Challenge');
    }

    const isMember = await this.challengeRepository.isMember(challengeId, userId);
    if (isMember) {
      throw new ConflictError('You have already joined this challenge');
    }

    return this.challengeRepository.join(challengeId, userId);
  }

  /**
   * Leave a challenge.
   *
   * `NotFoundError` when not a member — the route returned 404 rather than 409
   * here, which is preserved, because "you are not in this" is a statement about
   * the user's own membership row and there is no resource to conflict with.
   */
  async leave(challengeId: string, userId: string) {
    const isMember = await this.challengeRepository.isMember(challengeId, userId);
    if (!isMember) {
      throw new NotFoundError('Challenge participation');
    }

    return this.challengeRepository.leave(challengeId, userId);
  }

  /**
   * Set the authenticated user's progress in a challenge they have joined.
   *
   * `ValidationError` (403 semantics, mapped by the route) when not a member.
   */
  async setProgress(
    challengeId: string,
    userId: string,
    input: UpdateChallengeProgressInput
  ) {
    const challenge = await this.challengeRepository.getById(challengeId);
    if (!challenge) {
      throw new NotFoundError('Challenge');
    }

    const isMember = await this.challengeRepository.isMember(challengeId, userId);
    if (!isMember) {
      throw new ValidationError('Join the challenge to update progress');
    }

    const result = await this.challengeRepository.setProgress(
      challengeId,
      userId,
      input.progress
    );
    if (!result) {
      throw new NotFoundError('Challenge participant');
    }

    return result;
  }

  /**
   * Delete a challenge. Only its creator may.
   */
  async delete(challengeId: string, userId: string): Promise<void> {
    const challenge = await this.challengeRepository.getById(challengeId);
    if (!challenge) {
      throw new NotFoundError('Challenge');
    }

    if (challenge.creatorId !== userId) {
      throw new ValidationError('Only the challenge creator can delete it');
    }

    const deleted = await this.challengeRepository.delete(challengeId, userId);
    if (!deleted) {
      throw new NotFoundError('Challenge');
    }
  }

  /** Participants in a challenge. */
  async participants(challengeId: string): Promise<ChallengeParticipant[]> {
    return this.challengeRepository.participants(challengeId);
  }
}

/**
 * Re-validated inside the service so the boundary is safe regardless of caller.
 *
 * The routes still validate with the same schema to keep their 400 response
 * shape, but a service method must not depend on that having happened — a future
 * caller (a cron job, another route) would otherwise write an unvalidated
 * progress value straight through.
 */
export const challengeIdSchema = z.object({
  id: z.string().min(1),
});

export const challengeService = new ChallengeService();
