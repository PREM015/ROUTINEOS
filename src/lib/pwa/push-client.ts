/**
 * PWA push client.
 * Registers the service worker and keeps the server's push subscription in
 * sync. Best effort: every failure is swallowed so features degrade silently.
 */

import {
  getPushSubscription,
  getNotificationPermission,
  isPushSupported,
  requestNotificationPermission,
  subscribeToPush,
} from '@/lib/pwa/notifications';

const SW_PATH = '/sw.js';

/**
 * Register the service worker (idempotent).
 */
export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(SW_PATH);
  } catch {
    // offline/dev environments may not serve sw.js yet
  }
}

/**
 * Subscribe the current device to push and POST the subscription to the
 * server. Returns true when the server now has an active subscription.
 * When permission was previously denied or the browser does not support
 * push, returns false without prompting.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (getNotificationPermission() === 'denied') return false;
  if (getNotificationPermission() === 'default') {
    const granted = (await requestNotificationPermission()) === 'granted';
    if (!granted) return false;
  }

  const existing = await getPushSubscription();
  if (existing) {
    return syncSubscription(existing);
  }

  const config = await fetchPushConfig();
  if (!config) return false;

  const subscription = await subscribeToPush({ applicationServerKey: config.publicKey });
  if (!subscription) return false;
  return syncSubscription(subscription);
}

/**
 * Unsubscribe the current device and remove it from the server.
 */
export async function removePushSubscription(): Promise<void> {
  const subscription = await getPushSubscription();
  if (subscription) {
    await subscription.unsubscribe().catch(() => undefined);
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH).catch(() => null);
    if (reg) {
      const sub = await reg.pushManager.getSubscription().catch(() => null);
      if (sub && sub.endpoint) {
        await deleteSubscription(sub.endpoint).catch(() => undefined);
      }
    }
  }
}

async function fetchPushConfig(): Promise<{ publicKey: string } | null> {
  try {
    const res = await fetch('/api/push-config', { credentials: 'include' });
    if (!res.ok) return null;
    const json: unknown = await res.json().catch(() => null);
    if (
      json &&
      typeof json === 'object' &&
      typeof (json as { publicKey?: unknown }).publicKey === 'string'
    ) {
      return { publicKey: (json as { publicKey: string }).publicKey };
    }
    return null;
  } catch {
    return null;
  }
}

async function syncSubscription(subscription: PushSubscription): Promise<boolean> {
  const pushSub = subscription.toJSON();
  if (!pushSub.endpoint || !pushSub.keys) return false;
  try {
    const res = await fetch('/api/push-subscriptions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: pushSub.endpoint,
        p256dh: pushSub.keys.p256dh,
        auth: pushSub.keys.auth,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : undefined,
        deviceType: 'WEB',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteSubscription(endpoint: string): Promise<void> {
  try {
    const res = await fetch('/api/push-subscriptions', { credentials: 'include' });
    if (!res.ok) return;
    const json: unknown = await res.json().catch(() => null);
    const data = Array.isArray(
      json && typeof json === 'object' ? (json as { data?: unknown }).data : null
    )
      ? (json as { data: Array<{ id: string; endpoint: string }> }).data
      : [];
    const match = data.find((s) => s.endpoint === endpoint);
    if (match) {
      await fetch(`/api/push-subscriptions/${match.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    }
  } catch {
    // never throws
  }
}