/**
 * Cross-page data synchronization events.
 *
 * These events are dispatched by client components after successful mutations
 * so that other pages/components can refresh their data. They supplement the
 * server-side state and are the contract for in-app cache invalidation without
 * a full page reload or router.refresh().
 *
 * All events are plain `Event` (no detail) except `today-data-changed` which
 * carries a `source` string for deduplication.
 */

export const APP_EVENTS = {
  /** Routine blocks created/updated/deleted, logs toggled. */
  ROUTINE_DATA_CHANGED: 'routine-data-changed',

  /** Day type changed via /api/day-mode (routine exception created/cleared). */
  DAY_MODE_CHANGED: 'day-mode-changed',

  /** Any write on /today that affects dashboard aggregates. */
  TODAY_DATA_CHANGED: 'today-data-changed',

  /** Goals created/updated/deleted/progress changed. */
  GOALS_DATA_CHANGED: 'goals-data-changed',

  /** Habits created/updated/deleted/archived (not just /today toggles). */
  HABITS_DATA_CHANGED: 'habits-data-changed',

  /** Sleep sessions started/stopped/updated. */
  SLEEP_DATA_CHANGED: 'sleep-data-changed',

  /** Focus sessions started/paused/completed. */
  FOCUS_DATA_CHANGED: 'focus-data-changed',

  /** Journal entries created/updated/deleted. */
  JOURNAL_DATA_CHANGED: 'journal-data-changed',
} as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

/**
 * Dispatch a cross-page data change event.
 */
export function dispatchAppEvent(name: AppEventName): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(name));
}

/**
 * Subscribe to a cross-page data change event.
 * Returns a cleanup function.
 */
export function onAppEvent(name: AppEventName, handler: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const listener = () => handler();
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/**
 * Convenience function for the today-data-changed event which carries a source.
 */
export interface TodayDataChangedDetail {
  source?: string;
}

export const TODAY_DATA_CHANGED = APP_EVENTS.TODAY_DATA_CHANGED;

export function notifyTodayDataChanged(source?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TodayDataChangedDetail>(TODAY_DATA_CHANGED, { detail: { source } })
  );
}

export function onTodayDataChanged(handler: () => void, ignoreSource?: string): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const listener = (event: Event) => {
    const detail = (event as CustomEvent<TodayDataChangedDetail>).detail;
    if (ignoreSource !== undefined && detail?.source === ignoreSource) return;
    handler();
  };

  window.addEventListener(TODAY_DATA_CHANGED, listener);
  return () => window.removeEventListener(TODAY_DATA_CHANGED, listener);
}

/**
 * Convenience re-exports for the most common events.
 */
export const notifyRoutineDataChanged = () => dispatchAppEvent(APP_EVENTS.ROUTINE_DATA_CHANGED);
export const notifyDayModeChanged = () => dispatchAppEvent(APP_EVENTS.DAY_MODE_CHANGED);
export const notifyGoalsDataChanged = () => dispatchAppEvent(APP_EVENTS.GOALS_DATA_CHANGED);
export const notifyHabitsDataChanged = () => dispatchAppEvent(APP_EVENTS.HABITS_DATA_CHANGED);
export const notifySleepDataChanged = () => dispatchAppEvent(APP_EVENTS.SLEEP_DATA_CHANGED);
export const notifyFocusDataChanged = () => dispatchAppEvent(APP_EVENTS.FOCUS_DATA_CHANGED);
export const notifyJournalDataChanged = () => dispatchAppEvent(APP_EVENTS.JOURNAL_DATA_CHANGED);