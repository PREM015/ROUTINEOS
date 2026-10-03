import { FeedbackRepository } from '@/server/repositories/feedback.repository';
import { assertAdmin } from '@/server/admin-guard';
import { NotFoundError } from '@/lib/errors/app-error';
import type { Feedback, FeedbackStatus } from '@/generated/prisma';
import type {
  CreateFeedbackInput,
  FeedbackQueryInput,
  UpdateFeedbackInput,
} from '@/schemas/feedback.schema';

/**
 * Feedback Service
 *
 * Owns feedback submission, the caller's own edits, and the admin triage path
 * (ERROR.md §1).
 *
 * The two audiences are deliberately separate methods rather than one method
 * with a role check inside it. A user editing their own submission and an admin
 * moving it through `NEW → REVIEWING → RESOLVED` are different operations on the
 * same row, and the previous layout put the admin gate in the *route* — so the
 * only thing preventing a user from marking their own report resolved was which
 * file the handler lived in.
 */
export class FeedbackService {
  private readonly feedbackRepository: FeedbackRepository;

  constructor(feedbackRepository: FeedbackRepository = new FeedbackRepository()) {
    this.feedbackRepository = feedbackRepository;
  }

  /** The caller's own submissions, with a total. */
  async listOwn(userId: string, query: FeedbackQueryInput) {
    const [items, total] = await Promise.all([
      this.feedbackRepository.findByUserId(userId, query),
      this.feedbackRepository.countByUserId(userId, query),
    ]);
    return { items, total };
  }

  /**
   * Every submission, for the admin triage queue. Admin only.
   */
  async listAllForAdmin(userId: string, query: FeedbackQueryInput) {
    await assertAdmin(userId);
    const [items, total] = await Promise.all([
      this.feedbackRepository.findAllPaginated(query),
      this.feedbackRepository.count(query),
    ]);
    return { items, total };
  }

  /**
   * Submit feedback.
   *
   * `userId` is nullable because anonymous submissions are allowed — the
   * feedback form is reachable before sign-in. The repository therefore scopes
   * by `userId IS NULL` for those rather than matching a null user.
   */
  async create(userId: string | null, input: CreateFeedbackInput) {
    return this.feedbackRepository.createFeedback(userId, input);
  }

  /**
   * One submission, only if the caller owns it.
   *
   * A non-owned row is reported as **not found** rather than forbidden: this is
   * the caller's own submission, so confirming that someone else's feedback id
   * exists would be an enumeration oracle.
   */
  async getOwn(userId: string, feedbackId: string): Promise<Feedback> {
    const feedback = await this.feedbackRepository.findById(feedbackId);
    if (!feedback || feedback.userId !== userId) {
      throw new NotFoundError('Feedback');
    }
    return feedback;
  }

  /**
   * Edit one of the caller's own submissions.
   *
   * Scoped by `userId` in the repository, so a row belonging to someone else
   * comes back as `null` and becomes a 404 here rather than being written to.
   */
  async updateOwn(
    userId: string,
    feedbackId: string,
    input: UpdateFeedbackInput
  ): Promise<Feedback> {
    const updated = await this.feedbackRepository.updateOwn(
      feedbackId,
      userId,
      input
    );
    if (!updated) {
      throw new NotFoundError('Feedback');
    }
    return updated;
  }

  /**
   * Move a submission through the triage workflow. Admin only.
   */
  async updateStatus(
    userId: string,
    feedbackId: string,
    status: FeedbackStatus
  ): Promise<Feedback> {
    await assertAdmin(userId);

    const existing = await this.feedbackRepository.findById(feedbackId);
    if (!existing) {
      throw new NotFoundError('Feedback');
    }

    return this.feedbackRepository.updateStatus(feedbackId, status);
  }
}

export const feedbackService = new FeedbackService();
