import { auth } from '@/lib/auth';
import { ApiKeyRepository } from '@/server/repositories/api-key.repository';
import type { APIKey } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateApiKeySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.isActive !== undefined,
    { message: 'No fields to update', path: ['name'] }
  );

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
 * GET /api/api-keys/[id]
 * Fetch a single API key owned by the authenticated user.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const repository = new ApiKeyRepository();
    const key = await repository.findByIdScoped(id, session.user.id);
    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: toSafeKey(key) });
  } catch (error) {
    console.error('Error fetching API key:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch API key' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/api-keys/[id]
 * Update a single API key owned by the authenticated user.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const body = await request.json();
    const validated = updateApiKeySchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const repository = new ApiKeyRepository();
    const key = await repository.update(id, session.user.id, {
      name: validated.data.name,
      description: validated.data.description,
      isActive: validated.data.isActive,
    });

    return NextResponse.json({ success: true, data: toSafeKey(key) });
  } catch (error) {
    console.error('Error updating API key:', error);

    if (error instanceof Error && error.message === 'API key not found') {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/api-keys/[id]
 * Permanently delete an API key owned by the authenticated user.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid API key id' }, { status: 400 });
    }

    const repository = new ApiKeyRepository();
    const result = await repository.deleteById(id, session.user.id);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting API key:', error);

    if (error instanceof Error && error.message === 'API key not found') {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to delete API key' },
      { status: 500 }
    );
  }
}