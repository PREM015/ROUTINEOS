/**
 * Device-local preferences for the achievements page.
 *
 * ## Why this exists
 *
 * The Trophy Room spec keeps several things on the device rather than the server:
 * showcase pins, view mode, grid density, the last-seen trophy level, the
 * recalculation-notice dismissal and the chime setting. None of them are account
 * data - a pin is a display preference, and storing it server-side would mean a
 * schema column, an endpoint and a privacy question for a UI toggle.
 *
 * ## Why the user id is in the key
 *
 * `localStorage` is per-origin, not per-account. Two people sharing a browser, or
 * one person signing out and someone else signing in, read the same keys. Without
 * the id in the key, account B inherits account A's pinned badges and last-seen
 * level - which on a level-up notice means either a spurious celebration or a
 * missing one, and on pins means showing someone else's achievements as their own.
 *
 * Every key is `routineos.achievements.<userId>.<name>`, so a collision is not
 * merely unlikely, it is structurally impossible for two ids.
 *
 * ## Storage may be absent
 *
 * Not "rarely absent": during SSR there is no `window`, Safari private mode throws
 * on `setItem`, and a full quota throws too. Every function here returns the
 * fallback rather than propagating, because a preferences layer that can crash a
 * page is worse than one that forgets a pin.
 */

const NAMESPACE = 'routineos.achievements';

/** Minimal surface, so tests can pass a fake and the browser can pass the real thing. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStore(): KeyValueStore | null {
  if (typeof window === 'undefined') return null;
  try {
    // Touching localStorage can itself throw when cookies are blocked, so the
    // property access is inside the try rather than beside it.
    const store = window.localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/**
 * The namespaced key for one preference.
 *
 * @example
 * deviceKey('user-1', 'pins') // => 'routineos.achievements.user-1.pins'
 */
export function deviceKey(userId: string, name: string): string {
  return `${NAMESPACE}.${userId}.${name}`;
}

/**
 * Read a JSON preference, falling back on absence *and* on corruption.
 *
 * A stored value that no longer parses - a renamed shape, a half-written entry -
 * is treated as absent rather than thrown, so a deploy that changes a preference's
 * shape cannot brick the page for the users who have the old one.
 */
export function readDeviceValue<T>(
  key: string,
  fallback: T,
  store: KeyValueStore | null = browserStore()
): T {
  if (!store) return fallback;
  try {
    const raw = store.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON preference. Returns whether it persisted. */
export function writeDeviceValue<T>(
  key: string,
  value: T,
  store: KeyValueStore | null = browserStore()
): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded, or Safari private mode. The in-memory value still stands for
    // this session; only the persistence is lost.
    return false;
  }
}

export function removeDeviceValue(
  key: string,
  store: KeyValueStore | null = browserStore()
): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // Nothing to do: a key that cannot be removed is also a key that cannot be read.
  }
}

// ============================================================================
// The preferences themselves
// ============================================================================

export const DEVICE_PREF = {
  pins: 'pins',
  view: 'view',
  density: 'density',
  lastSeenLevel: 'last-seen-level',
  noticeDismissed: 'notice-dismissed',
  chime: 'chime',
} as const;

export type DevicePrefName = (typeof DEVICE_PREF)[keyof typeof DEVICE_PREF];

export function prefKey(userId: string, name: DevicePrefName): string {
  return deviceKey(userId, name);
}

/**
 * Pinned showcase badge ids, most recently pinned first, at most three.
 *
 * Capped and de-duplicated on read rather than on write, because the cap is a
 * display rule and a value written before the cap existed must still be trimmed.
 * Entries naming a badge that has since been retired are dropped by the caller's
 * lookup, not here - this layer does not know the catalogue.
 */
export const MAX_PINS = 3;

export function readPins(
  userId: string,
  store: KeyValueStore | null = browserStore()
): string[] {
  const raw = readDeviceValue<unknown>(prefKey(userId, DEVICE_PREF.pins), [], store);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const pins: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || seen.has(entry)) continue;
    seen.add(entry);
    pins.push(entry);
    if (pins.length >= MAX_PINS) break;
  }
  return pins;
}

/** Add, remove or toggle a pin. Returns the new list; never exceeds {@link MAX_PINS}. */
export function togglePin(
  pins: readonly string[],
  id: string
): string[] {
  if (pins.includes(id)) return pins.filter((pin) => pin !== id);
  if (pins.length >= MAX_PINS) return [...pins];
  return [id, ...pins];
}

/**
 * Whether a stored level was ever seen.
 *
 * Used by the level-up notice, and it is a strict `>`: a *lower* stored level means
 * trophy levels were recalculated downwards, which is the case the dismissible
 * recalculation notice is for. A `>=` here would silently swallow it.
 */
export function isLevelIncrease(
  lastSeenLevel: number | null,
  computedLevel: number
): boolean {
  if (lastSeenLevel === null) return false;
  return computedLevel > lastSeenLevel;
}