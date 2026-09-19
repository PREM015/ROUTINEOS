/**
 * Pagination helpers for computing meta and building offset-based queries.
 * Mirrors the client-side counterpart of `base.repository.ts#buildPaginationQuery`.
 */

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Compute pagination metadata from total count + limit/offset.
 * @example getPaginationMeta(25, 10, 0)
 * // { total: 25, limit: 10, offset: 0, page: 1, totalPages: 3, hasMore: true, hasPrev: false, hasNext: true }
 */
export function getPaginationMeta(total: number, limit = 50, offset = 0): PaginationMeta {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeOffset = Math.max(0, Math.floor(offset));
  const page = Math.floor(safeOffset / safeLimit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  return {
    total,
    limit: safeLimit,
    offset: safeOffset,
    page,
    totalPages,
    hasMore: safeOffset + safeLimit < total,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

/**
 * Clamp a 1-based page number into the valid [1, totalPages] range.
 * @example clampPage(99, 3) // 3
 */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, Math.floor(totalPages)));
}

/**
 * Build a Prisma-friendly `{ take, skip }` query (limit capped at 100).
 * @example buildPaginationQuery(10, 20) // { take: 10, skip: 20 }
 */
export function buildPaginationQuery(limit?: number, offset?: number): { take?: number; skip?: number } {
  const query: { take?: number; skip?: number } = {};
  if (limit !== undefined && limit > 0) {
    query.take = Math.min(limit, 100);
  }
  if (offset !== undefined && offset > 0) {
    query.skip = offset;
  }
  return query;
}

/**
 * Convert a 1-based page number into a zero-based offset.
 * @example offsetFromPage(3, 10) // 20
 */
export function offsetFromPage(page: number, perPage = 50): number {
  return (Math.max(1, Math.floor(page)) - 1) * Math.max(1, Math.floor(perPage));
}