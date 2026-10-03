import { UserRepository } from '@/server/repositories/user.repository';
import { adminRepository } from '@/server/repositories/admin.repository';
import { assertAdmin } from '@/server/admin-guard';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import type { UpdateUserAdminInput } from '@/schemas/admin.schema';
import type { User } from '@/generated/prisma';
import { toUserId, type UserId } from '@/types/ids';

/**
 * Admin User Service
 *
 * Administrative user management (ERROR.md §1).
 *
 * The admin gate was inlined in all three handlers of
 * `/api/admin/users/[id]` and again in `/api/admin/feature-flags` and
 * `/api/admin/feedback` — six copies of a privilege check. It now lives in
 * `assertAdmin`.
 *
 * The two self-protection rules are here for the same reason, and they matter
 * more than they look: both an admin *deactivating* and an admin *deleting* their
 * own account are refused. An admin who does that locks themselves — and every
 * other admin — out of the only interface that can undo it.
 */
export class AdminUserService {
  private readonly userRepository: UserRepository;
  private readonly adminRepository: typeof adminRepository;

  constructor(
    userRepository: UserRepository = new UserRepository(),
    adminRepo: typeof adminRepository = adminRepository
  ) {
    this.userRepository = userRepository;
    this.adminRepository = adminRepo;
  }

  /**
   * Paginated user list for the admin console. Admin only.
   *
   * The `role` check here read `session.user.role` — a value from the **JWT** —
   * while every other admin route re-read the role from the database via
   * `assertAdmin`. Those two can disagree: demote an admin and their existing
   * token still says `ADMIN` until it expires, so the list stayed visible for the
   * life of the token while every other admin action 403'd immediately.
   */
  async listForAdmin(
    actorId: string,
    query: { limit: number; offset: number; search?: string }
  ) {
    await assertAdmin(toUserId(actorId));

    const [users, total] = await Promise.all([
      this.adminRepository.listUsers(query),
      this.adminRepository.countUsers(query.search),
    ]);

    return { users, total };
  }

  /** One user, for the admin console. Admin only. */
  async getForAdmin(actorId: string, userId: UserId): Promise<User> {
    await assertAdmin(toUserId(actorId));

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return user;
  }

  /**
   * Change a user's role or active status. Admin only.
   *
   * Fields are applied conditionally so an absent key in the body is not written
   * as `undefined` and accidentally cleared.
   */
  async updateForAdmin(
    actorId: string,
    userId: UserId,
    input: UpdateUserAdminInput
  ): Promise<User> {
    await assertAdmin(toUserId(actorId));

    if (userId === actorId && input.isActive === false) {
      throw new ValidationError('You cannot deactivate your own account');
    }

    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      throw new NotFoundError('User');
    }

    return this.userRepository.update(userId, {
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });
  }

  /**
   * Soft-delete a user. Admin only, and never the actor.
   *
   * Soft rather than hard: habits, goals and history are all keyed on the user
   * and are expensive to reconstruct, and the row stays available for audit.
   */
  async softDeleteForAdmin(actorId: string, userId: UserId): Promise<User> {
    await assertAdmin(toUserId(actorId));

    if (userId === actorId) {
      throw new ValidationError('You cannot delete your own account');
    }

    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      throw new NotFoundError('User');
    }

    return this.userRepository.softDelete(userId, 'Deleted by admin');
  }
}

export const adminUserService = new AdminUserService();
