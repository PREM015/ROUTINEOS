'use client';

/**
 * DeviceSessionTracker — keeps this browser's `DeviceSession` row alive.
 *
 * NextAuth uses the `jwt` strategy, so nothing in the framework ever writes a
 * `DeviceSession`. Without this component the table stayed empty and
 * `/settings/sessions` could only ever render its "No active sessions" state.
 *
 * A stable per-browser id is kept in localStorage and sent with each call, so
 * `UserRepository.upsertDeviceSession` refreshes the same row rather than
 * creating one per page load. Calls are throttled to keep `lastActiveAt`
 * meaningful without hammering the endpoint.
 */

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
// Client-safe enum mirror; importing `DeviceType` from `@/generated/prisma` as
// a value would bundle the 679 KB Node Prisma client into the browser.
import { DeviceType } from '@/constants/prisma-enums';

/** Refresh `lastActiveAt` at most this often. */
const HEARTBEAT_MS = 15 * 60 * 1000;

const DEVICE_ID_KEY = 'routineos.device.id';

function readDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // Private-mode / storage-disabled browsers simply don't get tracked.
    return null;
  }
}

/** Best-effort classification of the current browser. */
function detectDevice(): { deviceName: string; deviceType: DeviceType } {
  if (typeof navigator === 'undefined') {
    return { deviceName: 'Unknown device', deviceType: DeviceType.WEB };
  }

  const ua = navigator.userAgent;
  const isIpad = /iPad/i.test(ua);
  const isMobile = /Android|iPhone|iPod|Mobile/i.test(ua) && !isIpad;
  const isTablet = isIpad || /Tablet/i.test(ua);

  if (isTablet) return { deviceName: 'Tablet', deviceType: DeviceType.TABLET };
  if (isMobile) {
    return {
      deviceName: /Android/i.test(ua) ? 'Android device' : 'iOS device',
      deviceType: /Android/i.test(ua)
        ? DeviceType.MOBILE_ANDROID
        : DeviceType.MOBILE_IOS,
    };
  }

  const platform = navigator.platform || 'Desktop';
  return { deviceName: platform, deviceType: DeviceType.DESKTOP };
}

export function DeviceSessionTracker() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'authenticated') return;

    const deviceId = readDeviceId();
    if (!deviceId) return;

    let cancelled = false;
    const { deviceName, deviceType } = detectDevice();

    const register = async () => {
      try {
        const response = await fetch('/api/auth/device-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deviceId, deviceName, deviceType }),
        });
        if (response.ok) {
          window.localStorage.setItem(
            `${DEVICE_ID_KEY}.lastSync`,
            String(Date.now())
          );
        }
      } catch {
        // Tracking is best-effort; never surface a failure to the user.
      }
    };

    const lastSync = Number(
      window.localStorage.getItem(`${DEVICE_ID_KEY}.lastSync`) ?? '0'
    );

    if (Date.now() - lastSync > HEARTBEAT_MS) {
      void register();
    }

    const timer = window.setInterval(() => {
      if (!cancelled) void register();
    }, HEARTBEAT_MS);

    // Refresh when the tab comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void register();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  return null;
}

export default DeviceSessionTracker;
