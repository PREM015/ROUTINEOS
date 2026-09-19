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
  options: NotificationOptions = {}
): Promise<boolean> {
  if (!isNotificationsSupported()) return false;
  if (Notification.permission === 'denied') return false;
  if (Notification.permission === 'default') {
    if ((await requestNotificationPermission()) !== 'granted') return false;
  }

  const registration = await getRegistration();
  if (registration?.showNotification) {
    await registration.showNotification(title, options);
  } else {
    // eslint-disable-next-line no-new
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