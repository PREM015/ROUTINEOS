import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const updateDayTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  icon: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

async function getDayTypeOr404(userId: string, id: string) {
  const dayType = await db.dayTypeDefinition.findFirst({
    where: { id, userId },
    include: {
      _count: {
        select: {
          routineTemplates: true,
          routineExceptions: true,
          habitAssignments: true,
        },
      },
    },
  });

  if (!dayType) {
    return NextResponse.json({ error: 'Day type not found' }, { status: 404 });
  }

  return dayType;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const dayType = await getDayTypeOr404(session.user.id, id);

  if (dayType instanceof NextResponse) return dayType;

  return NextResponse.json({ success: true, data: dayType });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const dayType = await getDayTypeOr404(session.user.id, id);
    if (dayType instanceof NextResponse) return dayType;

    const body = await req.json();
    const data = updateDayTypeSchema.parse(body);

    // Check if slug is being changed and already exists
    if (data.slug && data.slug !== dayType.slug) {
      const existing = await db.dayTypeDefinition.findUnique({
        where: { userId_slug: { userId: session.user.id, slug: data.slug } },
      });
      if (existing) {
        return NextResponse.json({ error: 'A day type with this slug already exists' }, { status: 400 });
      }
    }

    // If setting as default, unset other defaults
    if (data.isDefault === true) {
      await db.dayTypeDefinition.updateMany({
        where: { userId: session.user.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const updated = await db.dayTypeDefinition.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        color: data.color,
        icon: data.icon,
        isDefault: data.isDefault,
        isArchived: data.isArchived,
        sortOrder: data.sortOrder,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.flatten() }, { status: 400 });
    }
    console.error('Error updating day type:', error);
    return NextResponse.json({ error: 'Failed to update day type' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const dayType = await getDayTypeOr404(session.user.id, id);
    if (dayType instanceof NextResponse) return dayType;

    // Check if day type has references
    if (
      dayType._count.routineTemplates > 0 ||
      dayType._count.routineExceptions > 0 ||
      dayType._count.habitAssignments > 0
    ) {
      // Soft delete (archive) instead of hard delete
      const archived = await db.dayTypeDefinition.update({
        where: { id },
        data: { isArchived: true },
      });
      return NextResponse.json({
        success: true,
        data: archived,
        message: 'Day type archived (has associated data). Use permanent delete to remove completely.',
      });
    }

    // Hard delete if no references
    await db.dayTypeDefinition.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Day type permanently deleted' });
  } catch (error) {
    console.error('Error deleting day type:', error);
    return NextResponse.json({ error: 'Failed to delete day type' }, { status: 500 });
  }
}