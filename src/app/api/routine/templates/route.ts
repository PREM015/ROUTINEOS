import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { DayType } from '@/generated/prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DAY_TYPES: DayType[] = ['WEEKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const templates = await prisma.routineTemplate.findMany({
    where: { userId: session.user.id }, include: { _count: { select: { blocks: true } } },
    orderBy: [{ dayType: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json({ success: true, data: templates });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const dayType = body?.dayType as DayType;
    if (!name || !DAY_TYPES.includes(dayType)) return NextResponse.json({ error: 'Name and valid day type are required.' }, { status: 400 });
    const template = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.routineTemplate.updateMany({ where: { userId: session.user.id, dayType }, data: { isDefault: false } });
      return tx.routineTemplate.create({ data: { userId: session.user.id, name, dayType, isDefault: Boolean(body.isDefault) } });
    });
    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error) {
    console.error('POST /api/routine/templates error:', error);
    return NextResponse.json({ error: 'Failed to create routine template.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const existing = await prisma.routineTemplate.findFirst({ where: { id: body?.id, userId: session.user.id } });
    if (!existing) return NextResponse.json({ error: 'Routine template not found.' }, { status: 404 });
    const isDefault = body?.isDefault === undefined ? existing.isDefault : Boolean(body.isDefault);
    const template = await prisma.$transaction(async (tx) => {
      if (isDefault) await tx.routineTemplate.updateMany({ where: { userId: session.user.id, dayType: existing.dayType }, data: { isDefault: false } });
      return tx.routineTemplate.update({
        where: { id: existing.id },
        data: { ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}), isDefault },
      });
    });
    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('PUT /api/routine/templates error:', error);
    return NextResponse.json({ error: 'Failed to update routine template.' }, { status: 500 });
  }
}
