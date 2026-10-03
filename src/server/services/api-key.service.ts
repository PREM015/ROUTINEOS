import { createHash, randomBytes } from 'node:crypto';
import { ApiKeyRepository } from '@/server/repositories/api-key.repository';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { z } from 'zod';
import type { APIKey } from '@/generated/prisma';
import { API_KEY_PREFIX, API_KEY_ENTROPY_BYTES } from '@/constants/api';

/**
 * API Key Service
 * Resolves a presented API key to the user that owns it.
 *
 * Keys are issued as `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}` and
 * only the SHA-256 hash is stored, so verification is a single indexed lookup
 * on `keyHash`. Revoked (`isActive: false`) and expired keys are filtered out
 * in the repository query, so no caller can authenticate one by forgetting to
 * check.
 *
 * Nothing calls this yet: every route authenticates with a NextAuth session.
 * It exists so a route can opt into key auth explicitly rather than having
 * authentication change behaviour underneath it. See ERROR.md.
 */

/**
 * Only the non-secret fields are updatable. `keyHash`, `isActive` and
 * `usageCount` are deliberately absent: rotating or revoking a key must go
 * through `revoke`/re-issue so the audit trail stays intact.
 */
const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

/** Outcome of resolving a presented key. */
export type ApiKeyAuthResult =
  | {
      ok: true;
      userId: string;
      keyId: string;
      /** Parsed `scopes` JSON array; empty when the key is unscoped. */
      scopes: string[];
    }
  | {
      ok: false;
      reason: 'missing' | 'malformed' | 'unknown' | 'revoked' | 'expired';
    };

/** Hash a raw key exactly the way `/api/api-keys` does when issuing one. */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Whether a string looks like a key this system issued. */
function hasExpectedShape(rawKey: string): boolean {
  return rawKey.startsWith(API_KEY_PREFIX) && rawKey.length > API_KEY_PREFIX.length;
}

/**
 * Zod shape for issuing a key.
 *
 * Lives here, not in the route, so the service can validate its own input —
 * `POST /api/api-keys` was the only route still reaching `ApiKeyRepository`
 * directly, and it validated with a private copy of this schema.
 */
const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less'),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
});

/**
 * Project an `APIKey` row into the shape the client is allowed to see.
 *
 * The raw key is never stored, so there is nothing to mask. `keyFingerprint` is
 * the first 8 characters of the *hash*, purely as a stable identifier so the UI
 * can tell two keys apart; it is not derived from the secret and reveals nothing
 * usable. `maskedKey` is likewise built from the hash, not the secret.
 */
function toSafeApiKey(key: APIKey) {
  return {
    id: key.id,
    name: key.name,
    description: key.description,
    keyFingerprint: key.keyHash.slice(0, 8),
    maskedKey: `••••••••${key.keyHash.slice(-4)}`,
    isActive: key.isActive,
    scopes: key.scopes,
    rateLimit: key.rateLimit,
    usageCount: key.usageCount,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    createdAt: key.createdAt,
  };
}

export class ApiKeyService {
  private apiKeyRepository: ApiKeyRepository;

  constructor() {
    this.apiKeyRepository = new ApiKeyRepository();
  }

  /**
   * Every key owned by the user, projected into the safe response shape.
   *
   * The projection is here rather than in the route because it is the thing that
   * decides what leaves the server. A route that forgot to apply it would return
   * `keyHash` — and while that is a hash rather than the secret, it is still the
   * value `authenticate` matches on.
   */
  async listForUser(userId: string) {
    const keys = await this.apiKeyRepository.findAllByUser(userId);
    return keys.map(toSafeApiKey);
  }

  /**
   * Issue a key. The raw value is returned exactly once, here, and is never
   * stored — only its SHA-256 hash is persisted.
   *
   * Hashing goes through the same `hashApiKey` that `authenticate` matches
   * against, so issuing and verifying cannot drift apart; a divergence would make
   * every key unverifiable and would not fail loudly.
   */
  async issue(userId: string, input: { name: string; description?: string }) {
    const parsed = createApiKeySchema.safeParse(input);
    if (!parsed.success) {
      // Carries the flattened Zod error as `details` so the 400 body is
      // byte-identical to the one the route used to return, which included
      // `details: validated.error.flatten()`.
      throw new ValidationError(
        'Invalid input',
        parsed.error.flatten() as unknown as Record<string, string[]>
      );
    }

    const rawKey = `${API_KEY_PREFIX}${randomBytes(API_KEY_ENTROPY_BYTES).toString('hex')}`;

    const created = await this.apiKeyRepository.create({
      name: parsed.data.name,
      description: parsed.data.description,
      keyHash: hashApiKey(rawKey),
      user: { connect: { id: userId } },
    });

    return { ...toSafeApiKey(created), key: rawKey };
  }

  /**
   * Resolve a raw key to its owner.
   *
   * `revoked` and `expired` are reported distinctly for logging, but both are
   * rejections: the repository query already excluded them, so reaching those
   * branches requires a follow-up lookup to explain the failure.
   */
  /** Update the mutable, non-secret fields of a key. */
  async update(userId: string, keyId: string, input: unknown): Promise<APIKey> {
    const parsed = updateApiKeySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid API key data');
    }
    if (!(await this.apiKeyRepository.findByIdScoped(keyId, userId))) {
      throw new NotFoundError('API key not found');
    }
    return this.apiKeyRepository.update(keyId, userId, {
      name: parsed.data.name,
      description: parsed.data.description,
    });
  }

  /** Ownership-checked read for the management UI. */
  async get(userId: string, keyId: string): Promise<APIKey | null> {
    return this.apiKeyRepository.findByIdScoped(keyId, userId);
  }

  /** Mark a key revoked so it can no longer authenticate. */
  async revoke(userId: string, keyId: string): Promise<APIKey> {
    const existing = await this.apiKeyRepository.findByIdScoped(keyId, userId);
    if (!existing) {
      throw new NotFoundError('API key not found');
    }
    if (!existing.isActive) {
      return existing;
    }
    return this.apiKeyRepository.revoke(keyId, userId);
  }

  async remove(userId: string, keyId: string): Promise<{ success: boolean }> {
    const existing = await this.apiKeyRepository.findByIdScoped(keyId, userId);
    if (!existing) {
      throw new NotFoundError('API key not found');
    }
    return this.apiKeyRepository.deleteById(keyId, userId);
  }

  async authenticate(rawKey: string | null | undefined): Promise<ApiKeyAuthResult> {
    if (!rawKey) {
      return { ok: false, reason: 'missing' };
    }
    if (!hasExpectedShape(rawKey)) {
      return { ok: false, reason: 'malformed' };
    }

    const keyHash = hashApiKey(rawKey);
    const key = await this.apiKeyRepository.findAuthenticatableByHash(keyHash);

    if (!key) {
      // Distinguish "never issued" from "exists but unusable" for logs, while
      // returning a rejection either way. The unfiltered lookup is for
      // explanation only; access was already refused above.
      const inactive = await this.apiKeyRepository.findByHashIncludingInactive(keyHash);
      if (!inactive) {
        return { ok: false, reason: 'unknown' };
      }
      const expired = inactive.expiresAt !== null && inactive.expiresAt.getTime() <= Date.now();
      return { ok: false, reason: expired ? 'expired' : 'revoked' };
    }

    let scopes: string[] = [];
    if (key.scopes) {
      try {
        const parsed: unknown = JSON.parse(key.scopes);
        if (Array.isArray(parsed)) {
          scopes = parsed.filter((scope): scope is string => typeof scope === 'string');
        }
      } catch {
        // A malformed scopes column must not deny an otherwise valid key; an
        // unscoped key is the conservative reading.
        scopes = [];
      }
    }

    // Observability only; never allowed to fail the request.
    await this.apiKeyRepository.recordUsage(key.id);

    return { ok: true, userId: key.userId, keyId: key.id, scopes };
  }

  /**
   * Extract a presented key from the common header forms.
   *
   * Supports `Authorization: Bearer <key>` and `X-API-Key: <key>`. Session
   * cookies are deliberately ignored here — this is an alternative credential,
   * not a replacement, and a route should decide which it accepts.
   */
  static extractFromHeaders(headers: Headers): string | null {
    const auth = headers.get('authorization');
    if (auth) {
      const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
      if (match?.[1]) return match[1].trim();
    }
    return headers.get('x-api-key')?.trim() || null;
  }
}

export const apiKeyService = new ApiKeyService();
