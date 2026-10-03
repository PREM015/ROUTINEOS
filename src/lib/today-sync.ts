/**
 * In-app data-change contract for `/today`.
 *
 * Every card on `/today` is a client component holding its own `useState`, and
 * the page performs no `revalidatePath`/`revalidateTag`, so a write in one card
 * leaves the others showing pre-write numbers. `router.refresh()` does not help:
 * it only re-renders **server** components, and every card that needs to react
 * is a client component.
 *
 * This module is the one place the event name lives, so a writer and a reader
 * cannot drift apart. `day-mode-changed` predates it and stays the cross-page
 * contract (`/dashboard`'s `RightNow`/`Timeline` and `CurrentRoutineBlock`
 * listen for that one); this event is the `/today`-internal counterpart.
 *
 * A write is broadcast with a `source`, and a reader that owns that write passes
 * the same source to opt out. Without it a card that both writes and listens —
 * the habit checklist is the only one — would issue a second identical GET for
 * data it had just refreshed itself.
 */

export const TODAY_DATA_CHANGED = 'today-data-changed';

export interface TodayDataChangedDetail {
  /** Identifies the writer, e.g. the id of the card that performed the write. */
  source?: string;
}

/**
 * Announce that a write on `/today` changed data other cards display.
 *
 * Safe to call unconditionally: no listener is a no-op. Prefer this over
 * `router.refresh()` for client state, and dispatch `day-mode-changed` as well
 * when the change should also reach `/dashboard`.
 */
export function notifyTodayDataChanged(source?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<TodayDataChangedDetail>(TODAY_DATA_CHANGED, { detail: { source } })
  );
}

/**
 * Subscribe to `notifyTodayDataChanged`.
 *
 * Pass the `source` you dispatch with to skip your own writes. The listener is
 * removed on cleanup, so the effect that calls this needs no extra bookkeeping.
 */
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
