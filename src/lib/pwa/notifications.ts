/**
 * PWA notifications helpers.
 * Notification permission, push subscription, and in-app system notifications.
 */

const isClient = typeof window !== 'undefined';

export type NotificationPermissionState =
  NotificationPermission | 'unsupported';

export interface PushHeaders {
  url?: string;
  applicationServerKey?: string;
}

/**
 * Options accepted by `showNotification`.
 *
 * TypeScript's DOM lib exposes exactly one `NotificationOptions`, the **window
 * constructor's** version, which omits the service-worker-only fields. The
 * service-worker form (`ServiceWorkerRegistration.showNotification`, which is
 * the path actually taken whenever a worker is registered) additionally
 * supports `vibrate`, `data`, `actions`, `image` and friends.
 *
 * Declaring the superset here means callers can pass the richer options without
 * a cast, and the window fallback silently drops the fields it does not know
 * about — which is exactly what the browser does.
 */
export type ShowNotificationOptions = NotificationOptions & {
  /** Service-worker-only. Ignored by the `new Notification()` fallback. */
  vibrate?: number | number[];
  /** Service-worker-only payload available to the notification's event handler. */
  data?: unknown;
  /** Service-worker-only action buttons. */
  actions?: Array<{ action: string; title: string; icon?: string }>;
  /** Service-worker-only image. */
  image?: string;
};

/**
 * Whether the Notifications API and service workers are available.
 */
export function isNotificationsSupported(): boolean {
  return isClient && 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Current notification permission state.
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Request notification permission. Resolves the resulting state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

/**
 * Whether the Push API is available (implies an active service worker).
 */
export function isPushSupported(): boolean {
  return (
    isClient &&
    'PushManager' in window &&
    'serviceWorker' in navigator
  );
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isClient || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Show a system notification. Falls back to the older `Notification` API when
 * the service worker is unavailable.
 */
export async function showNotification(
  title: string,
  options: ShowNotificationOptions = {}
): Promise<boolean> {
  if (!isNotificationsSupported()) return false;
  if (Notification.permission === 'denied') return false;
  if (Notification.permission === 'default') {
    if ((await requestNotificationPermission()) !== 'granted') return false;
  }

  const registration = await getRegistration();
  if (registration?.showNotification) {
    // Preferred path: the service worker understands the extra fields, and the
    // notification survives the tab being closed.
    await registration.showNotification(title, options);
  } else {
    // Fallback. The window constructor reads only the fields it knows about and
    // ignores the rest, so the two paths stay interchangeable.
    new Notification(title, options);
  }
  return true;
}

/**
 * Current push subscription, or `null`.
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  if (!registration?.pushManager) return null;
  return registration.pushManager.getSubscription();
}

/**
 * Subscribe to push notifications with the given server key.
 */
export async function subscribeToPush({
  applicationServerKey,
}: PushHeaders = {}): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  if (!registration?.pushManager) return null;

  try {
    const options: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
    };
    if (applicationServerKey) {
      options.applicationServerKey = applicationServerKey;
    }
    return await registration.pushManager.subscribe(options);
  } catch {
    return null;
  }
}

/**
 * Unsubscribe from push notifications. Resolves `false` when not subscribed.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await getPushSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}