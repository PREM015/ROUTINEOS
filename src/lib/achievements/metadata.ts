/**
 * Reading an `Achievement` row's stable catalogue key.
 *
 * Pure: takes the two fields the row actually has and returns the definition id
 * or `null`. No Prisma import, so client components and `tests/` can use it.
 *
 * ## Why this is not just `metadata.definitionId`
 *
 * `Achievement.definitionId` is the canonical key, but it was added after rows
 * had already been written, so legacy rows still only carry it inside the
 * `metadata` JSON blob. The page, the service and the showcase therefore all
 * have to agree on which of the two wins, and they disagreed: the page matched
 * on the display *title* while the service matched on the id, so a renamed
 * definition silently dropped out of the grid and out of the XP total.
 *
 * The order below is the one rule: column first, metadata as the legacy
 * fallback, `null` for a genuinely custom row.
 */

/** The two fields of an `Achievement` row this module needs. */
export interface AchievementRowIdentity {
  definitionId?: string | null;
  metadata?: string | null;
}

/**
 * The catalogue id an unlocked row belongs to, or `null` when it is not a
 * catalogue achievement.
 *
 * @example
 * definitionIdOf({ definitionId: 'night-owl' })                  // => 'night-owl'
 * definitionIdOf({ metadata: '{"definitionId":"night-owl"}' })  // => 'night-owl'
 * definitionIdOf({ metadata: 'not json' })                      // => null
 */
export function definitionIdOf(row: AchievementRowIdentity): string | null {
  if (typeof row.definitionId === 'string' && row.definitionId.length > 0) {
    return row.definitionId;
  }
  if (!row.metadata) return null;
  try {
    const parsed: unknown = JSON.parse(row.metadata);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const id = (parsed as { definitionId?: unknown }).definitionId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
