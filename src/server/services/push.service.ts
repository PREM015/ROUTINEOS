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
      return { sent: 0, failed: 0 };
    }

    const subscriptions = await this.pushSubscriptionRepository.findAll(userId);
    const body = JSON.stringify({ ...payload, data: payload.data ?? null });
    let sent = 0;
    let failed = 0;

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
        if (status === 404 || status === 410 || status === 400) {
          // Subscription is dead or unauthorized: prune it.
          await this.pushSubscriptionRepository
            .delete(sub.userId, sub.id)
            .catch(() => undefined);
        }
      }
    }

    return { sent, failed };
  }

  /**
   * Convenience for sleep notifications: fire-and-forget, never throws.
   */
  async notify(userId: string, payload: PushPayload): Promise<void> {
    await this.sendToUser(userId, payload).catch(() => undefined);
  }
}

export const pushService = new PushService();