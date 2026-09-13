import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    const goals = await prisma.goal.findMany({
      where: {
        userId: session.user.id,
        ...(type ? { type: type as any } : {}),
      },
      include: { progressLogs: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: goals });
  } catch (error) {
    console.error('GET /api/goals error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, title, description, targetValue, unit, priority, startDate, endDate } = body;

    const goal = await prisma.goal.create({
      data: {
        userId: session.user.id,
        type: type || 'WEEKLY',
        title,
        description,
        targetValue: Number(targetValue ?? 0),
        currentValue: 0,
        unit,
        priority: priority || 'MEDIUM',
        status: 'ACTIVE',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      include: { progressLogs: true },
    });

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('POST /api/goals error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create goal' }, { status: 500 });
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
      return NextResponse.json({ success: false, error: 'Goal id is required' }, { status: 400 });
    }

    const goal = await prisma.goal.update({
      where: { id, userId: session.user.id },
      data: {
        ...(updates.type ? { type: updates.type } : {}),
        ...(updates.title ? { title: updates.title } : {}),
        ...(updates.description !== undefined ? { description: updates.description || null } : {}),
        ...(updates.targetValue !== undefined ? { targetValue: Number(updates.targetValue) } : {}),
        ...(updates.currentValue !== undefined ? { currentValue: Number(updates.currentValue) } : {}),
        ...(updates.unit !== undefined ? { unit: updates.unit || null } : {}),
        ...(updates.priority ? { priority: updates.priority } : {}),
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.startDate ? { startDate: new Date(updates.startDate) } : {}),
        ...(updates.endDate ? { endDate: new Date(updates.endDate) } : {}),
      },
      include: { progressLogs: true },
    });

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('PUT /api/goals error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update goal' }, { status: 500 });
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
      return NextResponse.json({ success: false, error: 'Goal id is required' }, { status: 400 });
    }

    const goal = await prisma.goal.delete({
      where: { id, userId: session.user.id },
      include: { progressLogs: true },
    });

    return NextResponse.json({ success: true, data: goal });
  } catch (error) {
    console.error('DELETE /api/goals error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete goal' }, { status: 500 });
  }
}
