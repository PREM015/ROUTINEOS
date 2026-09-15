/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest } from 'next/server';
import { createAuthHandler } from '@/lib/middleware/api-handler';
import { db } from '@/lib/db';
import { z } from 'zod';
import { ConflictError } from '@/lib/errors/app-error';

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50, "Name too long"),
  description: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color format").optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
});

export const GET = createAuthHandler(async (req, { session }) => {
  const { searchParams } = new URL(req.url);
  const includeArchived = searchParams.get('includeArchived') === 'true';

  const where: any = { userId: session.user.id };
  if (!includeArchived) {
    where.isArchived = false;
  }

  const categories = await db.category.findMany({
    where,
    include: {
      _count: {
        select: {
          habits: true,
          routineBlocks: true,
          focusSessions: true,
          projects: true,
        },
      },
    },
    orderBy: [
      { isArchived: 'asc' },
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
  });

  return categories;
});

export const POST = createAuthHandler(
  async (req, { session, body }) => {
    // Normalize name for uniqueness check
    const nameNormalized = body.name.toLowerCase().trim().replace(/\s+/g, '-');

    // Check for duplicate category name
    const existing = await db.category.findFirst({
      where: {
        userId: session.user.id,
        nameNormalized,
      },
    });

    if (existing) {
      throw new ConflictError('A category with this name already exists');
    }

    // Get max sort order
    const maxOrder = await db.category.findFirst({
      where: { userId: session.user.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const category = await db.category.create({
      data: {
        ...body,
        nameNormalized,
        userId: session.user.id,
        sortOrder: body.sortOrder ?? (maxOrder?.sortOrder ?? 0) + 1,
      },
    });

    return category;
  },
  createCategorySchema
);