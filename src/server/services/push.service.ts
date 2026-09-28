import webpush from 'web-push';
import { PushSubscriptionRepository } from '@/server/repositories/push-subscription.repository';

/**
 * Push Service
 * Best-effort web push delivery. VAPID keys are read from the environment
 * (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) and must
 * be generated with `web-push generate-vapid-keys`. When the keys are absent
 * the service degrades to a no-op so the rest of the app keeps working.
 */

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  actions?: Array<{ action: string; title: string }>;
  /** Extra data forwarded to the service worker, e.g. { promptId } */
  data?: Record<string, unknown>;
}

/**
 * Coerce `VAPID_SUBJECT` into something the Web Push spec accepts.
 *
 * The spec requires the contact to be a `mailto:` URI or an `https:` URL. People
 * naturally set `VAPID_SUBJECT=someone@example.com`, and `web-push` then throws
 * `Vapid subject is not a valid URL`, which — because this runs in a constructor
 * on a module-level singleton — used to fail the whole build.
 *
 * So a bare email is upgraded to `mailto:someone@example.com` rather than
 * rejected. Anything already valid is passed through untouched.
 */
function normaliseVapidSubject(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return 'mailto:dev@routineos.example';
  if (/^mailto:/i.test(value) || /^https?:/i.test(value)) return value;
  // Looks like a bare email address.
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return `mailto:${value}`;
  return value;
}

interface SendResult {
  sent: number;
  failed: number;
  /**
   * Why the send did not fully succeed, or why it was skipped entirely.
   *
   * Added because a dead pipeline previously reported `{ sent: 0, failed: 0 }`
   * with no explanation, which every caller read as "nothing to do". `/api/push/test`
   * returns this so a failed test notification can say what is actually wrong
   * instead of just "no devices".
   */
  reason?: string;
}

export class PushService {
  private pushSubscriptionRepository: PushSubscriptionRepository;
  private vapidConfigured = false;
  /** Why VAPID could not be configured, for diagnostics. Never throws. */
  private vapidError: string | null = null;

  constructor() {
    this.pushSubscriptionRepository = new PushSubscriptionRepository();
    this.configureVapid();
  }

  /**
   * Configure VAPID.
   *
   * ## Why this must never throw
   *
   * This runs in the constructor, and `pushService` is a module-level singleton
   * that routes import transitively. `webpush.setVapidDetails` throws when the
   * subject is not a valid URL/`mailto:` URI, and it also throws on malformed
   * keys. Because that happened at import time, a single malformed
   * `VAPID_SUBJECT` took down **the entire Next.js build**:
   *
   *   Failed to collect configuration for /api/achievements/celebrate
   *   [cause]: Error: Vapid subject is not a valid URL. someone@example.com
   *
   * A push misconfiguration should degrade push, not the whole application.
   * Failures are now recorded in `vapidError` and surfaced through
   * `/api/push/test` and `sendToUser`, which already return a `reason`.
   */
  private configureVapid(): void {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      this.vapidError =
        'VAPID keys are missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.';
      return;
    }

    try {
      webpush.setVapidDetails(normaliseVapidSubject(process.env.VAPID_SUBJECT), publicKey, privateKey);
      this.vapidConfigured = true;
      this.vapidError = null;
    } catch (error) {
      this.vapidConfigured = false;
      this.vapidError = error instanceof Error ? error.message : 'Invalid VAPID configuration';
      console.error('[PUSH] VAPID configuration rejected:', this.vapidError);
    }
  }

  get enabled(): boolean {
    return this.vapidConfigured;
  }

  get publicKey(): string | null {
    return this.vapidConfigured ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null;
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<SendResult> {
    if (!this.vapidConfigured) {
      // Previously a bare `{ sent: 0, failed: 0 }` with no explanation, so a
      // completely dead push system reported "nothing to do" and every caller
      // treated it as success. That is why a broken pipeline stayed invisible.
      // Reporting the reason lets `/api/push/test` tell the user what is wrong.
      return {
        sent: 0,
        failed: 0,
        reason:
          this.vapidError ??
          'Push is not configured server-side. NEXT_PUBLIC_VAPID_PUBLIC_KEY and ' +
            'VAPID_PRIVATE_KEY must both be set.',
      };
    }

    const subscriptions = await this.pushSubscriptionRepository.findAll(userId);

    // Without this, a user with no registered devices got `{ sent: 0, failed: 0 }`
    // with no reason, which reads as "delivered fine" in the test-notification
    // response. Saying "no devices" is the single most useful diagnostic here.
    if (subscriptions.length === 0) {
      return {
        sent: 0,
        failed: 0,
        reason:
          'No registered devices for this account. Open the app on the device ' +
          'you want to be notified on and enable push notifications there first.',
      };
    }

    const body = JSON.stringify({ ...payload, data: payload.data ?? null });
    let sent = 0;
    let failed = 0;
    /** Non-fatal per-device problems, surfaced to the caller instead of dropped. */
    const errors: string[] = [];

    for (const sub of subscriptions) {
      try {
        const pushSub: webpush.PushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        await webpush.sendNotification(pushSub, body);
        sent += 1;
      } catch (error) {
        failed += 1;
        const status =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;
        const message =
          error instanceof Error ? error.message : 'Unknown push delivery error';

        /**
         * `web-push` collapses some responses to a generic "Received unexpected
         * response code" and puts the real explanation in `err.body`. Without
         * this, a device whose subscription was created with a different VAPID
         * key failed with a message that named neither the cause nor the fix.
         */
        const bodyText =
          error && typeof error === 'object' && 'body' in error
            ? String((error as { body?: unknown }).body ?? '').trim()
            : '';

        if (status === 404 || status === 410 || status === 400) {
          // Subscription is dead or unauthorized: prune it.
          await this.pushSubscriptionRepository
            .delete(sub.userId, sub.id)
            .catch(() => undefined);
          errors.push(`${sub.deviceName ?? 'device'}: subscription expired (${status})`);
        } else if (status === 403 && /do not correspond to the credentials/i.test(bodyText)) {
          /**
           * The subscription was created with a different VAPID public key than
           * the one this server signs with — a key rotation, or a client that
           * used a stale build-time key. Re-registering the device on the current
           * origin is the only fix, so say exactly that instead of leaving the
           * user with a dead device.
           */
          errors.push(
            `${sub.deviceName ?? 'device'}: registered with a different VAPID key ` +
              `(HTTP 403). Delete this device and re-add it from this site to fix it.`
          );
        } else {
          // Previously swallowed with no log at all, so a VAPID mismatch or a
          // network failure looked identical to a successful send.
          errors.push(
            `${sub.deviceName ?? 'device'}: ${message}${status ? ` (HTTP ${status})` : ''}` +
              (bodyText ? ` — ${bodyText.slice(0, 200)}` : '')
          );
        }
      }
    }

    if (errors.length > 0) {
      console.error(`[PUSH] ${failed} of ${subscriptions.length} deliveries failed:`, errors.join('; '));
    }

    return {
      sent,
      failed,
      ...(errors.length > 0 ? { reason: errors.join('; ') } : {}),
    };
  }

  /**
   * Convenience for sleep notifications: fire-and-forget.
   *
   * Still never throws — a failed push must not break the sleep flow — but the
   * failure is logged instead of being discarded by `.catch(() => undefined)`.
   */
  async notify(userId: string, payload: PushPayload): Promise<void> {
    try {
      const result = await this.sendToUser(userId, payload);
      if (result.failed > 0 || result.reason) {
        console.error('[PUSH] notify() reported a problem:', result.reason ?? `${result.failed} failed`);
      }
    } catch (error) {
      console.error('[PUSH] notify() threw:', error);
    }
  }
}

export const pushService = new PushService();