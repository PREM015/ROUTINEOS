const CACHE_NAME = 'routineos-v1';
const OFFLINE_URL = '/offline';

const STATIC_ASSETS = [
  '/',
  '/today',
  '/habits',
  '/goals',
  '/offline',
  // The manifest the app actually links (`metadata.manifest`). This used to
  // point at `/manifest.json`, an unlinked duplicate of the same document that
  // nothing referenced.
  '/manifest.webmanifest',
];

/**
 * Install event.
 *
 * This used to be `cache.addAll(STATIC_ASSETS)`, which is all-or-nothing: a
 * single non-ok response rejects the whole promise, and because that rejection
 * was passed to `event.waitUntil(...)` the install failed, the worker never
 * activated, and every downstream feature that needs an active registration
 * (push subscribe, offline fallback, notification clicks) silently did nothing.
 *
 * That is exactly what happened: `/offline` was listed here but the route did
 * not exist, so it 404'd and killed the install. Each asset is now added
 * individually and failures are reported but not fatal, so a missing or renamed
 * route degrades to "that one asset is not precached" instead of "the entire
 * offline/push system is dead and nothing says so".
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((error) => {
            console.warn('[sw] precache skipped', url, error && error.message);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Maximum entries kept in the runtime cache. Without a cap, every same-origin
// 200 GET is added forever and the cache only ever shrinks when CACHE_NAME is
// bumped, which is a version bump away. This is a FIFO trim: `cache.keys()`
// resolves in insertion order, so the oldest entries are the ones dropped.
const MAX_CACHE_ENTRIES = 60;

async function trimCache(cache) {
  try {
    const keys = await cache.keys();
    const excess = keys.length - MAX_CACHE_ENTRIES;
    if (excess <= 0) {
      return;
    }
    for (let i = 0; i < excess; i += 1) {
      await cache.delete(keys[i]);
    }
  } catch (error) {
    // A failed trim must never break the fetch it was racing with.
    console.warn('[sw] cache trim failed:', error);
  }
}

// Fetch event - Network first, cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions
  if (event.request.url.includes('chrome-extension')) {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Never cache API responses. They are per-user, frequently changing, and a
  // stale hit is worse than an error: the user would be shown yesterday's score
  // or a habit list that no longer matches what the server has.
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Never cache Next.js App Router flight payloads.
  //
  // A client-side navigation is a same-path GET carrying `?_rsc=<cache-buster>`,
  // and `event.request` includes that query string — so these were written to the
  // runtime cache and then replayed from it when the network failed. The result
  // is a fully-rendered page of stale data (yesterday's habits, an old score)
  // presented as current, with only the offline banner as a cue. Bailing out
  // leaves the navigation to fail honestly instead.
  if (requestUrl.searchParams.has('_rsc') || requestUrl.searchParams.has('_rsc')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            return cache
              .put(event.request, responseToCache)
              .then(() => trimCache(cache));
          });
        }

        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((response) => {
          return response || caches.match(OFFLINE_URL);
        });
      })
  );
});

// ---- Offline store --------------------------------------------------------
//
// IndexedDB, deliberately not `localStorage`.
//
// The outbox and the schedule mirror both have to be readable from *inside* this
// worker — the previous design queued into `localStorage`
// (`src/lib/offline/queue.ts`), which a service worker cannot reach at all, so
// the `sync` handler here had nothing to flush and was a `console.log`.
//
// Two stores:
//   `outbox`   user mutations captured while offline, replayed on reconnect
//   `schedule` notifications mirrored from the server, fired locally when due
const DB_NAME = 'routineos-offline';
const DB_VERSION = 1;
const STORE_OUTBOX = 'outbox';
const STORE_SCHEDULE = 'schedule';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // `autoIncrement` gives every queued mutation a stable local id, which is
      // what the response handler deletes on success.
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: 'localId', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SCHEDULE)) {
        db.createObjectStore(STORE_SCHEDULE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(storeName, mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        try {
          result = run(store);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

function putAll(storeName, records) {
  if (!records || records.length === 0) return Promise.resolve(0);
  return tx(storeName, 'readwrite', (store) => {
    records.forEach((record) => store.put(record));
    return records.length;
  });
}

function getAll(storeName) {
  return tx(storeName, 'readonly', (store) => ({ __req: store.getAll() })).catch(() => []);
}

function deleteOne(storeName, key) {
  return tx(storeName, 'readwrite', (store) => {
    store.delete(key);
    return key;
  });
}

function clearStore(storeName) {
  return tx(storeName, 'readwrite', (store) => {
    store.clear();
    return true;
  });
}

// ---- Offline reminder scheduling ----------------------------------------
//
// Why there are two mechanisms rather than one.
//
// `NotificationOptions.scheduledTime` is the only standards-track way to defer a
// notification, and it is **Chromium desktop only** — not Chrome for Android, not
// Safari, not Firefox. A pure `scheduledTime` implementation would therefore
// work on the user's laptop and silently do nothing on their phone.
//
// So both run, de-duplicated by `firedAt` in the same record:
//   1. `scheduledTime`, where the engine honours it (fast path, survives the tab
//      and the app being closed).
//   2. `periodicsync`, which walks the mirror and fires anything due
//      (Chromium, needs the PWA installed). This is what covers Android.
// Push remains the primary channel and fires first when the server is reachable;
// whichever arrives first wins and the other is suppressed by `firedAt`.
const DEFAULT_SYNC_TAG = 'routineos-notifications';

/**
 * Hand a future notification to the engine's own scheduler.
 *
 * `scheduledTime` is the only standards-track way to defer a notification, and
 * it is **Chromium desktop only** — not Chrome for Android, not Safari, not
 * Firefox. So this is a best-effort fast path:
 *
 *   * If the engine accepts it, the browser owns the notification and it fires
 *     even with the app closed. The record is then **deleted** from the mirror,
 *     so {@link fireDue} cannot deliver a duplicate.
 *   * If the engine throws (or the field is ignored), the record is left in
 *     place and `fireDue` delivers it on the `periodicsync` / app-open path,
 *     which is the only thing that covers Chrome for Android.
 *
 * Returning whether the record was claimed is what makes the two paths
 * mutually exclusive; without that, every desktop reminder would fire twice.
 */
async function claimScheduled(record) {
  if (typeof record.scheduledTime !== 'number') return false;
  const due = record.scheduledTime;
  if (due <= Date.now()) return false; // already due; leave it to fireDue

  try {
    await self.registration.showNotification(record.title, {
      body: record.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: record.tag || `routineos-${record.id}`,
      renotify: true,
      requireInteraction: Boolean(record.actions && record.actions.length),
      timestamp: Date.now(),
      data: {
        url: record.url || '/today',
        notificationId: record.notificationId || null,
        promptId: record.promptId || null,
        actions: record.actions || [],
        offline: true,
      },
      actions: (record.actions || []).slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) })),
      // Non-standard: present in Chromium desktop, rejected elsewhere.
      scheduledTime: due,
    });
    await deleteOne(STORE_SCHEDULE, record.id);
    return true;
  } catch (error) {
    console.warn('[sw] scheduledTime unavailable, falling back to periodicsync', error && error.message);
    return false;
  }
}

/** Fire every mirrored notification whose time has passed and that has not fired. */
async function fireDue() {
  const records = await getAll(STORE_SCHEDULE);
  const now = Date.now();
  let fired = 0;

  for (const record of records) {
    if (record.firedAt) continue;
    const due = typeof record.scheduledTime === 'number' ? record.scheduledTime : Date.parse(record.scheduledFor);
    if (!due || Number.isNaN(due) || due > now) continue;

    try {
      await self.registration.showNotification(record.title, {
        body: record.body || '',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag: record.tag || `routineos-${record.id}`,
        renotify: true,
        requireInteraction: Boolean(record.actions && record.actions.length),
        timestamp: now,
        data: {
          url: record.url || '/today',
          notificationId: record.notificationId || null,
          promptId: record.promptId || null,
          actions: record.actions || [],
          // Marks the origin so a reply can be queued offline if needed.
          offline: true,
        },
        actions: (record.actions || []).slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) })),
      });
      await deleteOne(STORE_SCHEDULE, record.id);
      fired += 1;
    } catch (error) {
      console.warn('[sw] failed to fire scheduled notification', error && error.message);
    }
  }

  if (fired > 0) console.log(`[sw] fired ${fired} offline reminder(s)`);
  return fired;
}

/**
 * Periodic Background Sync — the Android/offline path.
 *
 * Chromium only, and only once the PWA is installed; registered defensively so
 * Safari/Firefox simply never call `fireDue` from here.
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === DEFAULT_SYNC_TAG) {
    event.waitUntil(fireDue());
  }
});

// ---- Page -> worker channel ---------------------------------------------
//
// There was no `message` listener at all, so a page had no way to tell the
// worker anything. This is the channel the schedule mirror and the outbox use.
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') return;

  const reply = (payload) => {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
    }
  };

  if (msg.type === 'SCHEDULE_UPSERT') {
    event.waitUntil(
      putAll(STORE_SCHEDULE, Array.isArray(msg.records) ? msg.records : [msg.record])
        .then((count) => {
          // Hand anything still in the future to the engine's scheduler where it
          // is supported; whatever it refuses stays mirrored for `fireDue`.
          const incoming = Array.isArray(msg.records) ? msg.records : [msg.record];
          return Promise.all(incoming.filter(Boolean).map(claimScheduled)).then(
            (results) => reply({ ok: true, stored: count, claimed: results.filter(Boolean).length })
          );
        })
        .catch((error) => reply({ ok: false, error: String(error) }))
    );
    return;
  }

  if (msg.type === 'SCHEDULE_CLEAR') {
    event.waitUntil(
      clearStore(STORE_SCHEDULE)
        .then(() => reply({ ok: true }))
        .catch((error) => reply({ ok: false, error: String(error) }))
    );
    return;
  }

  if (msg.type === 'ARM_SYNC') {
    // The page already persisted the action; we only need to be woken to replay
    // it. This exists so a queued action is not stored twice: the page's write
    // assigns an `autoIncrement` `localId`, and re-`put`ting the same record
    // here (the old `OUTBOX_PUSH` path) allocated a *second* key, so one action
    // became two rows and was sent twice.
    event.waitUntil(Promise.resolve(registerSync(DEFAULT_SYNC_TAG)));
    reply({ ok: true });
    return;
  }

  if (msg.type === 'OUTBOX_PUSH') {
    const incoming = Array.isArray(msg.items) ? msg.items : [msg.item];
    event.waitUntil(
      putAll(STORE_OUTBOX, incoming)
        .then((count) => {
          registerSync(DEFAULT_SYNC_TAG);
          reply({ ok: true, stored: count });
        })
        .catch((error) => reply({ ok: false, error: String(error) }))
    );
    return;
  }

  if (msg.type === 'FLUSH') {
    event.waitUntil(flushOutbox().then((result) => reply({ ok: true, ...result })));
  }
});

/** Ask the browser to wake us for `tag` once connectivity returns. */
function registerSync(tag) {
  try {
    if (self.registration.sync) {
      self.registration.sync.register(tag);
    }
  } catch {
    // Background Sync is Chromium-only; the page-level `online` listener is the
    // fallback, so a failure here is not fatal.
  }
}

/**
 * Replay queued mutations.
 *
 * Each item carries a client-generated `idempotencyKey`, sent as `X-Idempotency-Key`
 * so a retry of an item that actually landed cannot double-apply (offline
 * replay is inherently at-least-once, and the sleep/habit endpoints are not
 * naturally idempotent — without this, a reconnect storm duplicates writes).
 */
async function flushOutbox() {
  const items = await getAll(STORE_OUTBOX);
  if (items.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method || 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': item.idempotencyKey || `sw-${item.localId}`,
        },
        body: JSON.stringify(item.body ?? {}),
      });

      if (response.ok) {
        await deleteOne(STORE_OUTBOX, item.localId);
        synced += 1;
      } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        // A genuine client error will never succeed on replay, so dropping it is
        // correct — holding it would wedge the queue behind a poison message.
        console.warn('[sw] dropping unsendable queued action', item.url, response.status);
        await deleteOne(STORE_OUTBOX, item.localId);
        failed += 1;
      } else {
        // Server error or still offline — keep for the next attempt.
        failed += 1;
        break;
      }
    } catch {
      failed += 1;
      break;
    }
  }

  if (synced > 0) console.log(`[sw] synced ${synced} queued action(s)`);
  return { synced, failed };
}

// Background sync — replaces a `console.log` stub that could never flush.
self.addEventListener('sync', (event) => {
  if (event.tag === DEFAULT_SYNC_TAG) {
    event.waitUntil(
      Promise.all([flushOutbox(), fireDue()]).catch(() => undefined)
    );
  }
  
  // Sync engine tag for offline action queue
  if (event.tag === 'routineos-sync') {
    event.waitUntil(
      flushOutbox().catch(() => undefined)
    );
  }
});

// ---- Web Push ------------------------------------------------------------

// Push payload shape:
//   { title, body?, url?, actions?: [{ action, title }],
//     data?: { notificationId?, promptId?, tag?, ...rest } }
//
// The server nests identity under `data` — `push.service.ts` sends
// `JSON.stringify({ ...payload, data: payload.data ?? null })` — so `promptId`
// and `notificationId` arrive ONE LEVEL DOWN.
//
// This handler used to read them as top-level keys (`data.notificationId`),
// which meant both were always `undefined`:
//   * `notificationId` became null, so the `data.notificationId` guard in
//     `notificationclick` never passed and the "Acknowledge" / "Snooze" buttons
//     silently did nothing for every notification type.
//   * `promptId` was never read at all, so "Start sleep" / "Not yet" POSTed
//     `{"promptId": undefined}`, `JSON.stringify` dropped the key, and
//     `/api/sleep/session/respond` rejected it with a 400.
// Unwrapping the nested object is what makes the action buttons work at all.
self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    // keep going with defaults
  }

  // These three must stay INSIDE this handler. `data` is the parsed push payload
  // and does not exist until the line above; hoisting them to module scope throws
  // `ReferenceError: data is not defined` while the worker is still being
  // evaluated, which fails the whole registration — so offline caching, push,
  // notification actions and background sync all silently stop working.
  const nested =
    data && typeof data.data === 'object' && data.data !== null ? data.data : {};

  const notificationId =
    typeof nested.notificationId === 'string' ? nested.notificationId : null;
  const promptId = typeof nested.promptId === 'string' ? nested.promptId : null;

  // `tag` decides whether a repeat REPLACES the earlier toast or stacks beside it.
  // The server never sends a top-level `tag`, so this used to fall through to the
  // single literal 'routineos' — which collapsed *every* notification in the app
  // into one, so a habit reminder and a goal reminder overwrote each other.
  // Keying the fallback on the notification id gives the intended behaviour:
  // repeats of the same reminder still collapse, distinct ones no longer collide.
  // `data` may be null when the payload is absent or unparseable.
  const tag =
    (typeof nested.tag === 'string' && nested.tag) ||
    (data && typeof data.tag === 'string' && data.tag) ||
    (notificationId ? `routineos-${notificationId}` : 'routineos');

  const title = data && typeof data.title === 'string' ? data.title : 'RoutineOS';
  const actions = Array.isArray(data && data.actions) ? data.actions : [];

  const options = {
    body: data && typeof data.body === 'string' ? data.body : '',
    // These pointed at '/icon-192.png', which does not exist — the real files
    // live in /icons/ with the PWA-standard size suffixes. Every notification
    // was therefore rendered with a broken image (or no image at all on some
    // platforms, which suppresses the notification entirely on Android).
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',

    // Windows/Chrome behaviour:
    //  * `tag` collapses repeats of the same reminder into one entry.
    //  * `renotify` makes a repeat still buzz/speak, which it would not if only
    //    the tag matched.
    //  * `requireInteraction` keeps the toast on screen until it is dismissed or
    //    acted on, which is the difference between a popup you can click and a
    //    line that silently slides into the notification centre.
    //  * `timestamp` is required for the notification to sort chronologically in
    //    the centre on some platforms.
    tag,
    renotify: true,
    requireInteraction: actions.length > 0,
    timestamp: Date.now(),

    data: {
      url: data && typeof data.url === 'string' ? data.url : '/today',
      notificationId,
      // Forwarded so `notificationclick` can answer the prompt. Without it the
      // sleep buttons were dead (see above).
      promptId,
      actions,
    },
    // Chrome renders at most two buttons on a notification, so only the first
    // two are sent.
    actions: actions.slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) })),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification && notification.data) || {};

  event.notification.close();

  const action = event.action;
  const url = data.url || '/today';

  // Sleep prompt: two dedicated endpoints, answered without opening the app.
  if (action === 'sleep-start') {
    event.waitUntil(
      fetch('/api/sleep/session/respond', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId: data.promptId, answer: 'YES' }),
      }).then(() => focusOrOpen(url))
    );
    return;
  }
  if (action === 'sleep-dismiss') {
    event.waitUntil(
      fetch('/api/sleep/session/respond', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId: data.promptId, answer: 'NOT_YET' }),
      }).then(() => focusOrOpen(url))
    );
    return;
  }
  // Wake confirmation: answer without opening the app.
  if (action === 'woke-at-target' || action === 'woke-later' || action === 'still-sleeping') {
    const body = action === 'woke-later' && data.actualWakeTime
      ? JSON.stringify({ promptId: data.promptId, action, actualWakeTime: data.actualWakeTime })
      : JSON.stringify({ promptId: data.promptId, action });
    event.waitUntil(
      fetch('/api/sleep/session/wake-confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).then(() => focusOrOpen(url))
    );
    return;
  }

  /**
   * Every other action (routine acknowledgement, snooze, skip) is reported to
   * one endpoint. `notificationId` scopes the action to the row that produced
   * it, and the service re-checks ownership, so a stale or forged id is a no-op
   * rather than a way to mutate someone else's data.
   */
  if (action && action !== 'open' && data.notificationId) {
    event.waitUntil(
      fetch('/api/notifications/action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: data.notificationId,
          action,
        }),
      })
        .catch(() => undefined)
        .then(() => focusOrOpen(url))
    );
    return;
  }

  // Clicking the body (or an action with no id) just opens the app.
  event.waitUntil(focusOrOpen(url));
});

async function focusOrOpen(url) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    if ('focus' in client) {
      client.navigate(url);
      return client.focus();
    }
  }
  return self.clients.openWindow(url);
}