import { PushSubscriptionRepository } from '@/server/repositories/push-subscription.repository';
import { assertSelf } from '@/server/admin-guard';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { createSubscriptionSchema, normalizeDeviceType } from '@/schemas/push-subscription.schema';
import type {
  CreateSubscriptionInput,
  RegisterDeviceInput,
} from '@/schemas/push-subscription.schema';
import type { PushSubscription } from '@/generated/prisma';

/**
 * Push Subscription Service
 *
 * Owns web-push subscription registration (ERROR.md §1).
 *
 * The Zod schema used to be declared inside the route file, so this service
 * could not validate its own input — it had to trust that a caller had already
 * done so. The schema now lives in `src/schemas/push-subscription.schema.ts` and
 * is applied here too, which means a future caller (the SW registration path, a
 * device-management route) cannot register a malformed endpoint by forgetting.
 */
export class PushSubscriptionService {
  private readonly pushSubscriptionRepository: PushSubscriptionRepository;

  constructor(
    pushSubscriptionRepository: PushSubscriptionRepository = new PushSubscriptionRepository()
  ) {
    this.pushSubscriptionRepository = pushSubscriptionRepository;
  }

  /** Every device registered by the user. */
  async listForUser(userId: string): Promise<PushSubscription[]> {
    return this.pushSubscriptionRepository.findAll(userId);
  }

  /**
   * Register (or refresh) a subscription.
   *
   * Re-registering an existing endpoint refreshes its keys rather than creating a
   * duplicate — the browser rotates `p256dh`/`auth` on re-subscribe, and a
   * duplicate row would leave the old, dead endpoint in the table sending pushes
   * to nowhere on every notification.
   */
  async register(userId: string, input: CreateSubscriptionInput) {
    const validated = createSubscriptionSchema.safeParse(input);
    if (!validated.success) {
      throw new ValidationError(
        'Invalid input',
        validated.error.flatten()
      );
    }

    const data = validated.data;
    return this.pushSubscriptionRepository.create(userId, {
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      auth: data.auth,
      deviceName: data.deviceName,
      deviceType: data.deviceType,
    });
  }

  /**
   * Register a device on behalf of `resourceUserId`, which must be the caller.
   *
   * The permissive shape from the legacy `/api/users/[id]/push-subscriptions`
   * route: the required-field check is explicit rather than schema-driven,
   * because that route reads a raw `request.json()` cast. `deviceType` is
   * normalised rather than trusted — the column is a Prisma enum, so a bad value
   * would fail the whole insert.
   */
  async registerForOwner(
    callerId: string,
    resourceUserId: string,
    input: RegisterDeviceInput
  ) {
    assertSelf(callerId, resourceUserId);

    if (!input.endpoint || !input.p256dh || !input.auth) {
      throw new ValidationError(
        'Endpoint, p256dh, and auth are required'
      );
    }

    return this.pushSubscriptionRepository.create(resourceUserId, {
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      deviceName: input.deviceName || 'Unknown Device',
      deviceType: normalizeDeviceType(input.deviceType),
    });
  }

  /** Devices registered by the caller, which must own `resourceUserId`. */
  async listForOwner(callerId: string, resourceUserId: string) {
    assertSelf(callerId, resourceUserId);
    return this.pushSubscriptionRepository.findAll(resourceUserId);
  }

  /** Remove one of the caller's own devices. */
  async removeForOwner(
    callerId: string,
    resourceUserId: string,
    subscriptionId: string
  ) {
    assertSelf(callerId, resourceUserId);
    return this.pushSubscriptionRepository.delete(resourceUserId, subscriptionId);
  }

  /**
   * Remove a device's subscription.
   *
   * Scoped by `userId` in the repository, so a subscription belonging to
   * somebody else is reported as not found rather than deleted.
   */
  async remove(userId: string, subscriptionId: string) {
    const existing = await this.pushSubscriptionRepository.findById(
      userId,
      subscriptionId
    );
    if (!existing) {
      throw new NotFoundError('Push subscription');
    }

    return this.pushSubscriptionRepository.delete(userId, subscriptionId);
  }
}

export const pushSubscriptionService = new PushSubscriptionService();
