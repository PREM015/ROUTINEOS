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

  constructor() {
    this.pushSubscriptionRepository = new PushSubscriptionRepository();
    this.configureVapid();
  }

  private configureVapid(): void {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:dev@routineos.example';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
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

        if (status === 404 || status === 410 || status === 400) {
          // Subscription is dead or unauthorized: prune it.
          await this.pushSubscriptionRepository
            .delete(sub.userId, sub.id)
            .catch(() => undefined);
          errors.push(`${sub.deviceName ?? 'device'}: subscription expired (${status})`);
        } else {
          // Previously swallowed with no log at all, so a VAPID mismatch or a
          // network failure looked identical to a successful send.
          errors.push(`${sub.deviceName ?? 'device'}: ${message}`);
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