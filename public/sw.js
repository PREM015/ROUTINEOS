const CACHE_NAME = 'routineos-v1';
const OFFLINE_URL = '/offline';

const STATIC_ASSETS = [
  '/',
  '/today',
  '/habits',
  '/goals',
  '/offline',
  '/manifest.json',
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

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
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

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-habits') {
    event.waitUntil(syncPendingHabits());
  }
});

async function syncPendingHabits() {
  // Sync logic would go here
  console.log('Syncing pending habits...');
}

// ---- Web Push ------------------------------------------------------------

// Push payload shape:
//   { title, body?, url?, tag?, notificationId?, actions?: [{ action, title }] }
//
// A `tag` plus `renotify` is what makes a repeated reminder for the same block
// *replace* the earlier one instead of stacking a column of near-identical
// toasts in the Windows notification centre.
self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    // keep going with defaults
  }

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
    tag: data && typeof data.tag === 'string' ? data.tag : 'routineos',
    renotify: true,
    requireInteraction: actions.length > 0,
    timestamp: Date.now(),

    data: {
      url: data && typeof data.url === 'string' ? data.url : '/today',
      notificationId: data && typeof data.notificationId === 'string' ? data.notificationId : null,
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