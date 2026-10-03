import { STORE_SCHEDULE, idbGetAll, idbPutAll } from '@/lib/offline/idb';

/**
 * Mirrors upcoming notifications into the service worker so reminders can fire
 * **while offline**.
 *
 * ## Why the worker needs a mirror
 *
 * Push requires a live server. When the device is offline — airplane mode, dead
 * Wi-Fi, a phone in a pocket with no signal — no push is delivered, so a purely
 * server-driven reminder system goes silent exactly when the user most needs the
 * nudge.
 *
 * So the server's plan is copied down to the device whenever there is a
 * connection, and the worker fires anything whose time arrives while offline.
 * Push stays the primary path (it arrives first when online); the mirror is the
 * offline fallback. Whichever fires first records `firedAt` and the other is
 * suppressed, so a user does not get the same reminder twice.
 *
 * ## Coverage and limits — stated plainly
 *
 * `NotificationOptions.scheduledTime` is Chromium **desktop** only; it is not
 * implemented in Chrome for Android, Safari or Firefox. That is why the worker
 * registers a `periodicsync` handler as well — periodic sync is the Android
 * path, and it requires the PWA to be *installed*.
 *
 * Neither mechanism runs while Chrome is fully terminated, and neither exists
 * on Safari. Where they are unavailable the mirror is simply never fired; this
 * module still keeps the copy current so behaviour is no worse than a
 * server-only system.
 */

/** How far ahead to mirror. Beyond this the plan changes too often to be worth caching. */
const HORIZON_MS = 48 * 60 * 60 * 1000;

/** Keeps the mirror bounded if notifications accumulate. */
const MAX_SCHEDULED = 60;

const SYNC_TAG = 'routineos-notifications';

interface NotificationRow {
  id?: string | null;
  title?: string | null;
  body?: string | null;
  actionUrl?: string | null;
  scheduledFor?: string | null;
  status?: string | null;
  actionData?: string | null;
  type?: string | null;
}

export interface ScheduledRecord {
  /** Stable key. Prefixed so a server row and a local guess cannot collide. */
  id: string;
  title: string;
  body: string;
  url: string;
  scheduledTime: number;
  scheduledFor: string;
  notificationId: string | null;
  promptId: string | null;
  tag: string;
  actions: Array<{ action: string; title: string }>;
  /** Set once shown, so push and local firing cannot both deliver it. */
  firedAt?: number | null;
  type?: string | null;
}

function parseActionData(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Coerce server rows into worker records, dropping anything unusable. */
export function toScheduledRecords(rows: NotificationRow[]): ScheduledRecord[] {
  const now = Date.now();
  const records: ScheduledRecord[] = [];

  for (const row of rows) {
    if (!row.id || !row.title || !row.scheduledFor) continue;

    const due = Date.parse(row.scheduledFor);
    if (Number.isNaN(due)) continue;
    // Only future work is worth mirroring; anything already due belongs to the
    // live app, not the offline path.
    if (due < now - 60 * 60 * 1000) continue;
    if (due > now + HORIZON_MS) continue;

    const actionData = parseActionData(row.actionData);
    const actions = Array.isArray(actionData.actions)
      ? (actionData.actions as Array<{ action?: unknown; title?: unknown }>)
          .filter((a) => a && typeof a.action === 'string' && typeof a.title === 'string')
          .map((a) => ({ action: String(a.action), title: String(a.title) }))
      : [];

    records.push({
      id: `notif:${row.id}`,
      title: row.title,
      body: row.body ?? '',
      url: row.actionUrl || '/today',
      scheduledTime: due,
      scheduledFor: row.scheduledFor,
      notificationId: row.id,
      promptId: typeof actionData.promptId === 'string' ? actionData.promptId : null,
      // Keyed on the row id so a *repeated* reminder of the same notification
      // replaces the earlier toast instead of stacking a column of duplicates.
      tag: `routineos-${row.id}`,
      actions,
      firedAt: null,
      type: row.type ?? null,
    });
  }

  return records.sort((a, b) => a.scheduledTime - b.scheduledTime).slice(0, MAX_SCHEDULED);
}

/**
 * Copy the server's plan down to the worker and into IndexedDB.
 *
 * Writes to both stores deliberately: IndexedDB is the source of truth the
 * worker reads, and writing there too means a worker restart or a browser that
 * refuses `postMessage` still has the plan on disk.
 *
 * Never throws — a failed mirror must not break the app that called it.
 */
export async function syncNotificationSchedule(): Promise<number> {
  if (typeof window === 'undefined') return 0;

  let mirrored = 0;
  try {
    const response = await fetch('/api/notifications', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return 0;

    const json: unknown = await response.json().catch(() => null);
    const rows =
      json && typeof json === 'object'
        ? (((json as { data?: unknown }).data as NotificationRow[] | undefined) ?? [])
        : [];

    const records = toScheduledRecords(Array.isArray(rows) ? rows : []);

    // Preserve `firedAt` for entries already delivered, so a re-sync does not
    // resurrect a notification the user has already seen.
    const existing = await idbGetAll<ScheduledRecord>(STORE_SCHEDULE).catch(() => []);
    const firedAtById = new Map(existing.map((r) => [r.id, r.firedAt ?? null]));
    for (const record of records) {
      const alreadyFired = firedAtById.get(record.id);
      if (alreadyFired != null) record.firedAt = alreadyFired;
    }

    await idbPutAll(STORE_SCHEDULE, records);
    await postToWorker({ type: 'SCHEDULE_UPSERT', records });
    await registerPeriodicSync();
    mirrored = records.length;
  } catch {
    // Offline, unauthenticated, or IDB unavailable — nothing to do.
  }

  return mirrored;
}

/**
 * Register periodic sync so the worker can fire reminders while offline.
 *
 * Chromium-only and requires an installed PWA. Every call is guarded: on
 * Safari/Firefox this is a no-op and the mirror simply sits unused.
 */
export async function registerPeriodicSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const periodic = registration as ServiceWorkerRegistration & {
      periodicSync?: { register(tag: string): Promise<void> };
    };
    if (!periodic.periodicSync) return false;
    await periodic.periodicSync.register(SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/** Send a message to the active worker, if there is one. */
export async function postToWorker(message: unknown): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const target = registration.active ?? navigator.serviceWorker.controller;
    if (!target) return false;
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

export { SYNC_TAG };
