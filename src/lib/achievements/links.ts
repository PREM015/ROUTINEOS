/**
 * Where an achievement notification should send the user.
 *
 * ## Why this exists
 *
 * Both the in-app notification and the unlock email built their button as
 * `/achievements/${achievement.id}`, and **that route does not exist**. The page is
 * a single route at `/achievements`; there is no `[id]` segment, so every one of
 * those links was a 404. The id made it worse rather than better: it is the
 * `Achievement` row's cuid, not the catalogue's definition id, so even if the
 * segment existed it would not have matched anything the page looks up.
 *
 * The destination is a **query parameter** rather than a path segment, which is
 * what the rest of this codebase already does for deep links - see
 * `${APP_URL}/goals?goal=${id}` in `email.service.ts` - and it matches how the page
 * actually reads state: `useSearchParams` picks up `highlight` and opens that
 * badge's detail panel.
 *
 * ## Why a shared builder
 *
 * Two call sites had the same broken URL written out separately. Fixing them in
 * place would leave the third future call site free to reintroduce it, and there is
 * no test that could tell. One exported function, used by both.
 *
 * ## Retired and unknown ids
 *
 * The link is built from the **definition** id, never from the row id, so it stays
 * meaningful after a rename. An id that no longer resolves degrades on the page
 * rather than erroring: the gallery simply renders, because `highlightedTile`
 * resolves to `null` and the drawer stays closed.
 */

import type { Achievement } from '@/generated/prisma';

/** The single route that lists achievements. */
export const ACHIEVEMENTS_PATH = '/achievements';

/** The query parameter the page reads to open a badge's detail panel. */
export const HIGHLIGHT_PARAM = 'highlight';

/**
 * An in-app link to one badge's detail panel.
 *
 * @example
 * achievementDeepLink('night-owl') // => '/achievements?highlight=night-owl'
 */
export function achievementDeepLink(definitionId: string): string {
  return `${ACHIEVEMENTS_PATH}?${HIGHLIGHT_PARAM}=${encodeURIComponent(definitionId)}`;
}

/**
 * Pick the definition id off an achievement row.
 *
 * Prefers the column, falls back to the legacy `metadata` blob, and returns `null`
 * for a genuinely custom row - in which case the caller should link to the gallery
 * rather than to a badge the page cannot find.
 */
export function definitionIdForLink(achievement: Pick<Achievement, 'definitionId' | 'metadata'>): string | null {
  const direct = achievement.definitionId;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  if (!achievement.metadata) return null;
  try {
    const parsed: unknown = JSON.parse(achievement.metadata);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const id = (parsed as { definitionId?: unknown }).definitionId;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * The link to put on an achievement notification.
 *
 * Falls back to the bare gallery when the row carries no definition id, so the
 * worst case is "lands on the page" rather than "lands on a 404".
 */
export function achievementLinkFor(
  achievement: Pick<Achievement, 'definitionId' | 'metadata'>
): string {
  const definitionId = definitionIdForLink(achievement);
  return definitionId === null ? ACHIEVEMENTS_PATH : achievementDeepLink(definitionId);
}