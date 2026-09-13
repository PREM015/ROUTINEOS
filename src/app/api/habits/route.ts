import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function resolveCategoryId(userId: string, categoryName?: string | null) {
  const name = categoryName?.trim();
  if (!name) return undefined;

  const normalizedName = name.toLowerCase();
  const category = await prisma.category.upsert({
    where: { userId_nameNormalized: { userId, nameNormalized: normalizedName } },
    update: { name },
    create: { userId, name, nameNormalized: normalizedName },
  });

  return category.id;
}

function toHabitPayload(raw: any) {
  return {
    name: typeof raw?.name === 'string' ? raw.name.trim() : undefined,
    tier: raw?.tier ?? 'GROWTH',
    status: raw?.status ?? 'ACTIVE',
    frequencyType: raw?.frequencyType ?? 'DAILY',
    frequencyValue: raw?.frequencyValue ?? null,
    reminderTime: raw?.reminderTime ?? null,
    startDate: raw?.startDate ? new Date(raw.startDate) : undefined,
    endDate: raw?.endDate ? new Date(raw.endDate) : null,
  };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const habits = await prisma.habit.findMany({
      where: {
        userId: session.user.id,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        category: true,
        logs: {
          take: 7,
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: habits.map((habit) => ({
        ...habit,
        category: habit.category?.name ?? undefined,
        startDate: habit.startDate.toISOString(),
        endDate: habit.endDate ? habit.endDate.toISOString() : undefined,
      })),
    });
  } catch (error) {
    console.error('GET /api/habits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch habits' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const categoryId = await resolveCategoryId(session.user.id, body?.category);

    const habit = await prisma.habit.create({
      data: {
        userId: session.user.id,
        ...toHabitPayload(body),
        categoryId,
        status: body?.status ?? 'ACTIVE',
      },
      include: { category: true, logs: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...habit,
        category: habit.category?.name ?? undefined,
        startDate: habit.startDate.toISOString(),
        endDate: habit.endDate ? habit.endDate.toISOString() : undefined,
      },
    });
  } catch (error) {
    console.error('POST /api/habits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create habit' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body ?? {};

    if (!id) {
      return NextResponse.json({ success: false, error: 'Habit id is required' }, { status: 400 });
    }

    const categoryId = await resolveCategoryId(session.user.id, updates?.category);
    const payload = toHabitPayload(updates);
    const habit = await prisma.habit.update({
      where: { id, userId: session.user.id },
      data: {
        ...payload,
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true, logs: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...habit,
        category: habit.category?.name ?? undefined,
        startDate: habit.startDate.toISOString(),
        endDate: habit.endDate ? habit.endDate.toISOString() : undefined,
      },
    });
  } catch (error) {
    console.error('PUT /api/habits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update habit' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = body?.id;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Habit id is required' }, { status: 400 });
    }

    const habit = await prisma.habit.delete({
      where: { id, userId: session.user.id },
      include: { category: true, logs: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...habit,
        category: habit.category?.name ?? undefined,
        startDate: habit.startDate.toISOString(),
        endDate: habit.endDate ? habit.endDate.toISOString() : undefined,
      },
    });
  } catch (error) {
    console.error('DELETE /api/habits error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete habit' }, { status: 500 });
  }
}
