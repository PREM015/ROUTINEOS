import { BaseRepository } from './base.repository';

/**
 * Admin Repository
 * Read-only helpers for the admin dashboard (user listing, stats).
 */

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  isDeleted: boolean;
  emailVerified: Date | null;
  createdAt: Date;
}

export class AdminRepository extends BaseRepository {
  /**
   * Paginated user list with optional search by name / email / displayName.
   */
  async listUsers(opts: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<AdminUserRow[]> {
    try {
      const take = Math.min(Math.max(opts.limit ?? 25, 1), 100);
      const skip = Math.max(opts.offset ?? 0, 0);
      const where =
        opts.search && opts.search.trim().length > 0
          ? {
              OR: [
                { name: { contains: opts.search.trim(), mode: 'insensitive' as const } },
                { displayName: { contains: opts.search.trim(), mode: 'insensitive' as const } },
                { email: { contains: opts.search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {};

      return await this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          isDeleted: true,
          emailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      });
    } catch (error) {
      this.handleError(error, 'listUsers');
    }
  }

  /**
   * Total user count (optionally filtered by the same search term)
   */
  async countUsers(search?: string): Promise<number> {
    try {
      const where =
        search && search.trim().length > 0
          ? {
              OR: [
                { name: { contains: search.trim(), mode: 'insensitive' as const } },
                { displayName: { contains: search.trim(), mode: 'insensitive' as const } },
                { email: { contains: search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {};
      return await this.prisma.user.count({ where });
    } catch (error) {
      this.handleError(error, 'countUsers');
    }
  }
}

export const adminRepository = new AdminRepository();
