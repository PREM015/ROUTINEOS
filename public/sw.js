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

// Push payload shape: { title, body?, url?, actions?: [{ action, title }] }
self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    // keep going with defaults
  }

  const title = data && typeof data.title === 'string' ? data.title : 'RoutineOS';
  const options = {
    body: data && typeof data.body === 'string' ? data.body : '',
    // These pointed at '/icon-192.png', which does not exist — the real files
    // live in /icons/ with the PWA-standard size suffixes. Every notification
    // was therefore rendered with a broken image (or no image at all on some
    // platforms, which suppresses the notification entirely on Android).
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    data: {
      url: data && typeof data.url === 'string' ? data.url : '/today',
      actions: Array.isArray(data && data.actions) ? data.actions : [],
    },
    actions: Array.isArray(data && data.actions)
      ? data.actions.slice(0, 2).map((a) => ({ action: String(a.action), title: String(a.title) }))
      : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification && notification.data) || {};

  event.notification.close();

  const action = event.action;
  if (action === 'sleep-start') {
    event.waitUntil(
      fetch('/api/sleep/session/respond', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId: data.promptId, answer: 'YES' }),
      }).then(() => focusOrOpen(data.url || '/today'))
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
      }).then(() => focusOrOpen(data.url || '/today'))
    );
    return;
  }

  event.waitUntil(focusOrOpen(data.url || '/today'));
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