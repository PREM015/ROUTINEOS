import { auth } from '@/lib/auth';
import { ApiKeyRepository } from '@/server/repositories/api-key.repository';
import { createHash, randomBytes } from 'node:crypto';
import type { APIKey } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const API_KEY_PREFIX = 'rk_live_';

const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

/**
 * Generate a raw API key and its SHA-256 hash. The raw key is only shown
 * once at creation time; the database stores the hash.
 */
function generateApiKey(): { key: string; keyHash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(key).digest('hex');
  return { key, keyHash };
}

/**
 * Project an APIKey row into a safe response shape with the key masked.
 */
function toSafeKey(key: APIKey) {
  return {
    id: key.id,
    name: key.name,
    description: key.description,
    maskedKey: `••••••${key.keyHash.slice(-4)}`,
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

    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
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
        { status: 400 }
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
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating API key:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}