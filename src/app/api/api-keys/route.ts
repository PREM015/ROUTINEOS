import { auth } from '@/lib/auth';
import { ApiKeyRepository } from '@/server/repositories/api-key.repository';
import { hashApiKey } from '@/server/services/api-key.service';
import { API_KEY_PREFIX, API_KEY_ENTROPY_BYTES } from '@/constants/api';
import { randomBytes } from 'node:crypto';
import type { APIKey } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

/**
 * Generate a raw API key and its SHA-256 hash. The raw key is only shown
 * once at creation time; the database stores the hash.
 *
 * Hashing is delegated to `hashApiKey` so issuing and verifying cannot drift
 * apart — a mismatch here would make every key unverifiable.
 */
function generateApiKey(): { key: string; keyHash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(API_KEY_ENTROPY_BYTES).toString('hex')}`;
  return { key, keyHash: hashApiKey(key) };
}

/**
 * Project an APIKey row into a safe response shape with the key masked.
 *
 * The raw key is never stored, so there is nothing to mask. This exposes the
 * first 8 characters of the *hash* purely as a stable identifier for the UI to
 * distinguish keys — it is not derived from the secret and reveals nothing
 * usable.
 */
function toSafeKey(key: APIKey) {
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

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user (masked).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new ApiKeyRepository();
    const keys = await repository.findAllByUser(session.user.id);

    return NextResponse.json({ success: true, data: keys.map(toSafeKey) });
  } catch (error) {
    console.error('Error fetching API keys:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

/**
 * POST /api/api-keys
 * Create a new API key. The raw key is returned exactly once; only its
 * hash is persisted.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createApiKeySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 },
      );
    }

    const { key, keyHash } = generateApiKey();
    const repository = new ApiKeyRepository();
    const created = await repository.create({
      name: validated.data.name,
      description: validated.data.description,
      keyHash,
      user: { connect: { id: session.user.id } },
    });

    return NextResponse.json(
      { success: true, data: { ...toSafeKey(created), key } },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating API key:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}
