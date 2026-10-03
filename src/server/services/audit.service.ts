import { AuditRepository } from '@/server/repositories/audit.repository';
import { assertSelf } from '@/server/admin-guard';

/**
 * Audit Service
 *
 * Read access to the caller's own activity feed (ERROR.md §1).
 *
 * `AuditRepository.findByUserId` is scoped by `userId`, so the repository is not
 * the place this can go wrong — the route is. That is why the ownership check
 * travels with the read rather than living beside it.
 */
export class AuditService {
  private readonly auditRepository: AuditRepository;

  constructor(auditRepository: AuditRepository = new AuditRepository()) {
    this.auditRepository = auditRepository;
  }

  /**
   * A page of the caller's own activity events.
   *
   * `assertSelf` means a caller can only ever read their own feed: passing
   * somebody else's id throws rather than returning an empty list, so a
   * mistyped or tampered id is an error instead of a silently empty response.
   */
  async activityFor(
    callerId: string,
    resourceUserId: string,
    limit: number,
    offset: number
  ) {
    assertSelf(callerId, resourceUserId);
    return this.auditRepository.findByUserId(resourceUserId, { limit, offset });
  }
}

export const auditService = new AuditService();
