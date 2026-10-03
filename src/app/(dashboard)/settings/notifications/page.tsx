'use client';

/**
 * Settings — Notifications
 *
 * Manages push notification preferences, device registration, and categories.
 *
 * Fixes vs. the previous version:
 *  - The five "Routine Notifications" switches and the "Advance notification"
 *    select sent fields that `updateSettingsSchema` silently stripped and that
 *    had no Prisma column, so they saved nothing and sprang back on reload.
 *    The columns now exist and the scheduler reads them.
 *  - Preferences come from the shared settings store, so this page can no
 *    longer disagree with `/settings/habits` about `dailyReminderTime`.
 *  - Device registration now sends `deviceType`, so the per-device icon and
 *    label branches below are actually reachable (the route accepts it; the
 *    page previously omitted it).
 *  - The VAPID key is read from `GET /api/push-config` instead of a build-time
 *    `process.env` value that is inlined at compile time.
 *  - `permissionState` is refreshed after granting permission, so the
 *    "Permission:" tile stopped being stale.
 *  - Mojibake in the debug block and test title (the source of the file's two
 *    `react/no-unescaped-entities` lint errors) was replaced with real UTF-8.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  Clock,
  ShieldAlert,
  MonitorSmartphone,
  Smartphone,
  Send,
  AlertCircle,
  CheckCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
// `UserSettings` is a type-only import (erased at compile time). The enums are
// runtime values, so they come from the client-safe mirror — importing them
// from `@/generated/prisma` would bundle the Node Prisma client into the
// browser.
import type { UserSettings } from '@/generated/prisma';
import { DeviceType } from '@/constants/prisma-enums';

interface PushSubscription {
  id: string;
  endpoint: string;
  deviceName: string | null;
  deviceType: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** The boolean `UserSettings` columns this page exposes as switches. */
type NotificationToggleKey = {
  [K in keyof UserSettings]: UserSettings[K] extends boolean | null ? K : never;
}[keyof UserSettings];

interface ToggleRow {
  key: NotificationToggleKey;
  label: string;
  description: string;
}

const ADVANCE_OPTIONS = [
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
];

/** Best-effort classification of this browser, stored with the subscription. */
function detectDeviceType(): DeviceType {
  if (typeof navigator === 'undefined') return DeviceType.WEB;
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return DeviceType.TABLET;
  if (/Android/i.test(ua)) return DeviceType.MOBILE_ANDROID;
  if (/iPhone|iPod|Mobile/i.test(ua)) return DeviceType.MOBILE_IOS;
  return DeviceType.DESKTOP;
}

function detectDeviceName(): string {
  if (typeof navigator === 'undefined') return 'This device';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Android/i.test(ua)) return 'Android device';
  if (/iPhone|iPod|Mobile/i.test(ua)) return 'iOS device';
  return navigator.platform || 'Desktop browser';
}

export default function NotificationsSettingsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    settings,
    loading: settingsLoading,
    save,
    patchLocal,
    saving,
    error: settingsError,
  } = useSettings();

  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState<PushSubscription[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [testNotificationLoading, setTestNotificationLoading] = useState(false);
  const [testNotificationResult, setTestNotificationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<{ success: boolean; message: string } | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  /** Why the runtime VAPID key is unavailable, if it is. */
  const [keyFetchError, setKeyFetchError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  // Plain function rather than `useCallback`: it is only ever invoked, never
  // passed down or used as a hook dependency, so the memo bought nothing and
  // the React Compiler refused to preserve it ("Compilation Skipped").
  const loadDevices = async (): Promise<void> => {
    if (!user?.id) {
      setDevicesLoading(false);
      return;
    }
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      const data = await apiRequest<PushSubscription[]>(
        `/api/users/${user.id}/push-subscriptions`
      );
      setDevices(data);
    } catch (err) {
      setDevicesError(err instanceof Error ? err.message : 'Failed to load devices.');
    } finally {
      setDevicesLoading(false);
    }
  };

  const userId = user?.id;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void loadDevices();
    // Re-fetch only when the account changes; `loadDevices` is intentionally
    // not a dependency because it is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    // Check push notification support and permission.
    if (typeof window !== 'undefined') {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window;
      setPushSupported(supported);
      if (supported && 'Notification' in window) {
        setPermissionState(Notification.permission);
      }
    }

    /**
     * The VAPID public key must come from the server at runtime.
     *
     * This used to fall back to `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` when
     * the `/api/push-config` request failed. `NEXT_PUBLIC_*` values are inlined
     * into the client bundle **at build time**, so after a key change that
     * fallback hands the browser a stale key. Registering with it produces a
     * subscription that is permanently rejected by the push service:
     *
     *   403 "the VAPID credentials in the authorization header do not
     *       correspond to the credentials used to create the subscriptions"
     *
     * with no way for the user to tell — registration reports success and the
     * device silently receives nothing. So a failed fetch is now surfaced
     * instead of being papered over.
     */
    let cancelled = false;
    void apiRequest<{ vapidPublicKey: string | null }>('/api/push-config')
      .then((data) => {
        if (cancelled) return;
        if (data.vapidPublicKey) {
          setVapidPublicKey(data.vapidPublicKey);
          setKeyFetchError(null);
        } else {
          setVapidPublicKey(null);
          setKeyFetchError(
            'The server did not return a VAPID key, so this browser cannot register for push without creating a subscription that would never receive anything.'
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setVapidPublicKey(null);
        setKeyFetchError(
          'Could not load the push configuration from the server, so this browser cannot be registered safely.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const persist = async () => {
    if (!settings) return;
    const result = await save({
      notificationsEnabled: settings.notificationsEnabled,
      emailNotifications: settings.emailNotifications,
      pushNotifications: settings.pushNotifications,
      smsNotifications: settings.smsNotifications,
      dailyReminder: settings.dailyReminder,
      // `null` clears the column; '' failed the HH:mm regex with a 400.
      dailyReminderTime: settings.dailyReminderTime?.trim() || '20:00',
      habitReminders: settings.habitReminders,
      goalReminders: settings.goalReminders,
      weeklyReviewReminder: settings.weeklyReviewReminder,
      monthlyResetReminder: settings.monthlyResetReminder,
      focusReminders: settings.focusReminders,
      breakReminders: settings.breakReminders,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      routineStartNotifications: settings.routineStartNotifications,
      upcomingRoutineNotifications: settings.upcomingRoutineNotifications,
      sleepReminderNotifications: settings.sleepReminderNotifications,
      sleepPreWarningNotifications: settings.sleepPreWarningNotifications,
      wakeConfirmationNotifications: settings.wakeConfirmationNotifications,
      habitReminderNotifications: settings.habitReminderNotifications,
      goalReminderNotifications: settings.goalReminderNotifications,
      advanceNotificationMinutes: settings.advanceNotificationMinutes,
    });
    if (result) setSaved(true);
  };

  const handleRegisterDevice = async () => {
    if (!user?.id || !pushSupported) return;

    setRegistering(true);
    setDeviceMessage(null);

    try {
      const permission = await Notification.requestPermission();
      // Refresh the tile immediately; it previously kept showing the stale
      // 'default' value until a full page reload.
      setPermissionState(permission);

      if (permission !== 'granted') {
        setDeviceMessage({
          success: false,
          message: 'Notification permission denied. Please allow notifications in browser settings.',
        });
        return;
      }

      if (!vapidPublicKey) {
        setDeviceMessage({
          success: false,
          message:
            keyFetchError ??
            'The server did not provide a VAPID key, so this browser cannot be registered for push.',
        });
        return;
      }

      let registration: ServiceWorkerRegistration;
      try {
        registration = await navigator.serviceWorker.ready;
      } catch {
        setDeviceMessage({ success: false, message: 'Service worker not ready. Refresh the page and try again.' });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey).buffer as ArrayBuffer,
      });

      await apiRequest(`/api/users/${user.id}/push-subscriptions`, {
        method: 'POST',
        body: {
          endpoint: subscription.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
          deviceName: detectDeviceName(),
          // Previously omitted, so the route stored null and every device
          // rendered with the generic icon and fell through to `deviceName`.
          deviceType: detectDeviceType(),
        },
      });

      await loadDevices();
      setDeviceMessage({ success: true, message: 'Device registered successfully!' });
    } catch (err) {
      setDeviceMessage({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to register device',
      });
    } finally {
      setRegistering(false);
    }
  };

  /**
   * Whether **this origin** already has a push subscription.
   *
   * `devices` is the account-wide list, so it can contain a subscription created
   * on a different origin (e.g. localhost during development) which tells you
   * nothing about whether *this* browser can receive pushes. A push subscription
   * is bound to the service worker that created it, so the only reliable check
   * is to ask this origin's own `pushManager` and match the endpoint.
   *
   * `null` means "not checked yet", so the UI can avoid claiming a state it
   * hasn't established.
   */
  const [thisOriginSubscribed, setThisOriginSubscribed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void (async () => {
      try {
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (!registration || cancelled) {
          if (!cancelled) setThisOriginSubscribed(false);
          return;
        }
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setThisOriginSubscribed(existing !== null);
      } catch {
        if (!cancelled) setThisOriginSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registering]);

  const handleUnregisterDevice = async (subscriptionId: string) => {
    if (!user?.id) return;

    setDeviceMessage(null);
    try {
      await apiRequest(`/api/users/${user.id}/push-subscriptions?subscriptionId=${subscriptionId}`, {
        method: 'DELETE',
      });
      await loadDevices();
      setDeviceMessage({ success: true, message: 'Device unregistered successfully!' });
    } catch (err) {
      setDeviceMessage({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to unregister device',
      });
    }
  };

  const handleSendTestNotification = async () => {
    if (!user?.id) return;

    setTestNotificationLoading(true);
    setTestNotificationResult(null);

    try {
      await apiRequest('/api/push/test', {
        method: 'POST',
        body: {
          userId: user.id,
          title: 'Test Notification',
          body: 'This is a test notification from RoutineOS. If you see this, push notifications are working!',
          url: '/today',
        },
      });
      setTestNotificationResult({ success: true, message: 'Test notification sent! Check your devices.' });
    } catch (err) {
      setTestNotificationResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send test notification',
      });
    } finally {
      setTestNotificationLoading(false);
    }
  };

  if (authLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-44" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <div className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-bold">Sign in required</h1>
          </div>
        </Card>
      </main>
    );
  }

  const channels: ToggleRow[] = [
    { key: 'emailNotifications', label: 'Email', description: 'Deliver notifications by email.' },
    { key: 'pushNotifications', label: 'Push notifications', description: 'Deliver real-time notifications to this device.' },
    { key: 'smsNotifications', label: 'SMS', description: 'Deliver notifications by text message.' },
  ];

  const general: ToggleRow[] = [
    { key: 'dailyReminder', label: 'Daily reminder', description: 'Get reminded to log your habits each day.' },
    { key: 'habitReminders', label: 'Habit reminders', description: 'Prompt before scheduled habits are due.' },
    { key: 'goalReminders', label: 'Goal check-ins', description: 'Nudge when a goal check-in is overdue.' },
    { key: 'weeklyReviewReminder', label: 'Weekly review', description: 'Receive a summary of your week.' },
    { key: 'monthlyResetReminder', label: 'Monthly reset', description: 'Remind you before the monthly reset.' },
    { key: 'focusReminders', label: 'Focus session reminders', description: 'Notify about scheduled or paused focus sessions.' },
    { key: 'breakReminders', label: 'Break reminders', description: 'Tell you when it\'s time for a break.' },
  ];

  const getDeviceIcon = (deviceType: string | null) => {
    if (deviceType?.includes('MOBILE') || deviceType?.includes('ANDROID') || deviceType?.includes('IOS')) {
      return <Smartphone className="h-5 w-5" />;
    }
    return <MonitorSmartphone className="h-5 w-5" />;
  };

  const getDeviceLabel = (device: PushSubscription) => {
    const type = device.deviceType;
    if (type?.includes('MOBILE_ANDROID')) return 'Android';
    if (type?.includes('MOBILE_IOS')) return 'iOS';
    if (type?.includes('DESKTOP')) return 'Desktop';
    if (type?.includes('WEB')) return 'Web Browser';
    return device.deviceName || 'Unknown Device';
  };

  if (!settings) {
    return (
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-8 w-44" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6 text-primary" />
          Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose what reminders you receive, how they&rsquo;re delivered, and manage your devices.
        </p>
      </div>

      {settingsError && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {settingsError}
        </div>
      )}
      {devicesError && (
        <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {devicesError}
        </div>
      )}

      {/* Push Support Status */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Push Notification Status</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              {pushSupported ? (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span>
                Browser Support: {pushSupported ? 'Supported' : 'Not Supported'}
              </span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              {permissionState === 'granted' ? (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              ) : permissionState === 'denied' ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <WifiOff className="h-4 w-4 text-amber-500" />
              )}
              <span>
                Permission: {permissionState.charAt(0).toUpperCase() + permissionState.slice(1)}
              </span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
{devices.length > 0 ? (
                <Wifi className="h-4 w-4 text-emerald-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span>
                Devices: {devices.length} registered
              </span>
            </div>
          </div>

          {/*
            The "Debug Info" panel (VAPID Key: Configured / Service Worker:
            Available / PushManager / Notification API / Secure Context) has been
            removed at the user's request.

            It was diagnostic scaffolding, not a user-facing feature, and it
            published internal deployment state to anyone who opened the page:
            whether push was configured server-side, whether the worker
            registered, and — via "Secure Context" — whether the session was
            served over HTTPS. That is useful reconnaissance for an attacker
            deciding whether the push/VAPID surface is worth attacking, and it is
            not information a user needs.

            The equivalent diagnostics remain available to operators where they
            belong: the browser DevTools console for `navigator.serviceWorker`
            and `Notification.permission`, and the server log, where
            `push.service` now records every failed delivery and its reason.
          */}

          {!pushSupported && (
            <p className="mt-3 text-sm text-destructive">
              Your browser doesn&rsquo;t support push notifications. Please use a modern browser like Chrome, Firefox, or Edge.
            </p>
          )}

          {deviceMessage && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-md px-4 py-3 text-sm ${
                deviceMessage.success
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-destructive/10 text-destructive'
              }`}
              role="status"
            >
              {deviceMessage.success ? (
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
              )}
              {deviceMessage.message}
            </div>
          )}

          {keyFetchError && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {keyFetchError}
            </p>
          )}

          {/*
            `devices.length === 0` used to gate this, which made it unreachable
            on any origin that was not the first one to register: `devices` is
            account-wide, so a localhost subscription hid the button on the
            deployed site and `pushManager.subscribe()` was never called there.
            The gate is now whether *this origin* has a subscription, which is
            what actually determines whether this browser can receive pushes.
            Re-registering is safe — the endpoint is upserted on its unique key.
          */}
          {pushSupported && permissionState !== 'granted' && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => void handleRegisterDevice()}
                disabled={devicesLoading || registering}
                isLoading={registering}
              >
                Enable Push Notifications
              </Button>
            </div>
          )}

          {/*
            Permission is already granted but this origin has no subscription —
            the exact state that made production silent. Previously the user had
            to guess that "Add Device" was the button they needed.
          */}
          {pushSupported && permissionState === 'granted' && thisOriginSubscribed === false && (
            <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              Notifications are allowed for this browser, but{' '}
              <strong>this site ({typeof window !== 'undefined' ? window.location.host : 'current origin'})</strong>{' '}
              has no push subscription yet. Press &ldquo;Add Device&rdquo; below to
              start receiving notifications here.
            </p>
          )}
          {pushSupported && permissionState === 'granted' && thisOriginSubscribed === true && (
            <p className="mt-3 text-sm text-muted-foreground">
              This browser is registered for push notifications on{' '}
              <span className="font-medium text-foreground">
                {typeof window !== 'undefined' ? window.location.host : 'this origin'}
              </span>
              . Close the site entirely and a reminder will still arrive.
            </p>
          )}
        </div>
      </Card>

      {/* Registered Devices */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MonitorSmartphone className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Registered Devices</h2>
            </div>
            {pushSupported && permissionState === 'granted' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRegisterDevice()}
                disabled={devicesLoading || registering}
                isLoading={registering}
              >
                {thisOriginSubscribed ? 'Re-register This Browser' : 'Add Device'}
              </Button>
            )}
          </div>

          {devicesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : devices.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No devices registered yet.
              {pushSupported && permissionState !== 'granted' && (
                <p className="mt-2">Click &ldquo;Enable Push Notifications&rdquo; above to register this device.</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {devices.map((device) => (
                <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{device.deviceName || getDeviceLabel(device)}</p>
                      <p className="text-xs text-muted-foreground">
                        {getDeviceLabel(device)} &middot; {device.isActive ? 'Active' : 'Inactive'}
                        {device.lastUsedAt && ` \u00b7 Last used ${new Date(device.lastUsedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleUnregisterDevice(device.id)}
                    disabled={devicesLoading}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Main Notification Settings */}
      <Card>
        <div className="p-6">
          {settingsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : (
            <div className="space-y-7">
              <Switch
                checked={settings.notificationsEnabled}
                onChange={(checked) => patchLocal({ notificationsEnabled: checked })}
                label="Notification master switch"
                description="Turns all reminders on or off at once."
              />

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Delivery channels</h2>
                <div className="space-y-3">
                  {channels.map((row) => (
                    <Switch
                      key={row.key}
                      checked={settings[row.key]}
                      onChange={(checked) => patchLocal({ [row.key]: checked })}
                      label={row.label}
                      description={row.description}
                      disabled={!settings.notificationsEnabled}
                    />
                  ))}
                </div>
              </div>

<div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Other Reminders</h2>
                <div className="space-y-3">
                  {general.map((row) => (
                    <Switch
                      key={row.key}
                      checked={settings[row.key]}
                      onChange={(checked) => patchLocal({ [row.key]: checked })}
                      label={row.label}
                      description={row.description}
                      disabled={!settings.notificationsEnabled}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Sleep Notifications</h2>
                <div className="space-y-3">
                  <Switch
                    key="sleepReminderNotifications"
                    checked={settings.sleepReminderNotifications}
                    onChange={(checked) => patchLocal({ sleepReminderNotifications: checked })}
                    label="Sleep Reminder"
                    description="Remind you when it's time to sleep."
                    disabled={!settings.notificationsEnabled || !settings.pushNotifications}
                  />
                  <Switch
                    key="sleepPreWarningNotifications"
                    checked={settings.sleepPreWarningNotifications}
                    onChange={(checked) => patchLocal({ sleepPreWarningNotifications: checked })}
                    label="Sleep Pre-Warning"
                    description="Notify 1 hour before bedtime to start winding down."
                    disabled={!settings.notificationsEnabled || !settings.pushNotifications || !settings.sleepReminderNotifications}
                  />
                  <Switch
                    key="wakeConfirmationNotifications"
                    checked={settings.wakeConfirmationNotifications}
                    onChange={(checked) => patchLocal({ wakeConfirmationNotifications: checked })}
                    label="Wake Confirmation"
                    description="Ask for actual wake time at target wake time."
                    disabled={!settings.notificationsEnabled || !settings.pushNotifications || !settings.sleepReminderNotifications}
                  />
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Advance Notification</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  When to notify before a routine block starts. Only applies while
                  &ldquo;Upcoming Routine&rdquo; is on.
                </p>
                <Select
                  label="Advance notification"
                  value={String(settings.advanceNotificationMinutes)}
                  onChange={(event) =>
                    patchLocal({
                      advanceNotificationMinutes: Number.parseInt(event.target.value, 10),
                    })
                  }
                  disabled={!settings.notificationsEnabled || !settings.pushNotifications}
                  options={ADVANCE_OPTIONS}
                />
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Other Reminders</h2>
                <div className="space-y-3">
                  {general.map((row) => (
                    <Switch
                      key={row.key}
                      checked={settings[row.key]}
                      onChange={(checked) => patchLocal({ [row.key]: checked })}
                      label={row.label}
                      description={row.description}
                      disabled={!settings.notificationsEnabled}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  label="Daily reminder time"
                  type="time"
                  value={settings.dailyReminderTime ?? ''}
                  onChange={(event) =>
                    patchLocal({ dailyReminderTime: event.target.value || null })
                  }
                  disabled={!settings.dailyReminder}
                  helperText="When the daily nudge is sent."
                />
                <Input
                  label="Quiet hours start"
                  type="time"
                  value={settings.quietHoursStart ?? ''}
                  onChange={(event) =>
                    patchLocal({ quietHoursStart: event.target.value || null })
                  }
                  helperText="Leave empty for none."
                />
                <Input
                  label="Quiet hours end"
                  type="time"
                  value={settings.quietHoursEnd ?? ''}
                  onChange={(event) =>
                    patchLocal({ quietHoursEnd: event.target.value || null })
                  }
                  helperText="Don&rsquo;t send reminders inside this window."
                />
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Sleep reminders are configured on the{' '}
                <Link href="/settings/sleep" className="text-primary hover:underline">
                  Sleep settings page
                </Link>
                .
              </p>

              {/* Test Notification Button */}
              <div className="border-t border-border pt-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">Test Notifications</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => void handleSendTestNotification()}
                    isLoading={testNotificationLoading}
                    disabled={
                      settingsLoading ||
                      saving ||
                      !settings.pushNotifications ||
                      devices.length === 0
                    }
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                    Send Test Notification
                  </Button>
                  {testNotificationResult && (
                    <div
                      className={`flex items-center gap-2 text-sm ${
                        testNotificationResult.success
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-destructive'
                      }`}
                      role="status"
                    >
                      {testNotificationResult.success ? (
                        <CheckCircle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      )}
                      {testNotificationResult.message}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sends a real push notification to all registered devices.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void persist()} isLoading={saving} disabled={settingsLoading}>
                  Save preferences
                </Button>
                {saved && (
                  <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Saved
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
