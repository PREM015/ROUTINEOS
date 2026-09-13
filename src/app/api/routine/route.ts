import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { DayType } from '@/generated/prisma/client';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findRoutineConflicts } from '@/lib/routine/conflicts';
import { validateCategoryName } from '@/lib/validation/category';

const DAY_TYPES: DayType[] = ['WEEKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'];

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

async function categoryIdFor(userId: string, rawName: unknown): Promise<string | undefined> {
  if (rawName === undefined || rawName === null || rawName === '') return undefined;
  const category = validateCategoryName(rawName);
  if (!category.success) throw new Error(category.error);
  const record = await prisma.category.upsert({
    where: { userId_nameNormalized: { userId, nameNormalized: category.nameNormalized } },
    update: { name: category.name },
    create: { userId, name: category.name, nameNormalized: category.nameNormalized },
  });
  return record.id;
}

async function ownedTemplate(userId: string, templateId: unknown) {
  if (typeof templateId !== 'string' || !templateId) return null;
  return prisma.routineTemplate.findFirst({ where: { id: templateId, userId } });
}

function serializeBlock<T extends { category: { name: string } | null }>(block: T) {
  return { ...block, category: block.category?.name ?? undefined };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('templateId');
  const dayType = searchParams.get('dayType');

  try {
    const template = templateId
      ? await prisma.routineTemplate.findFirst({ where: { id: templateId, userId: session.user.id } })
      : dayType && DAY_TYPES.includes(dayType as DayType)
        ? await prisma.routineTemplate.findFirst({
            where: { userId: session.user.id, dayType: dayType as DayType },
            orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
          })
        : null;
    if ((templateId || dayType) && !template) return NextResponse.json({ success: true, data: [], template: null });

    const blocks = await prisma.routineBlock.findMany({
      where: { userId: session.user.id, ...(template ? { templateId: template.id } : {}) },
      include: { category: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
    return NextResponse.json({ success: true, data: blocks.map(serializeBlock), template });
  } catch (error) {
    console.error('GET /api/routine error:', error);
    return NextResponse.json({ error: 'Failed to fetch routine blocks.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const template = await ownedTemplate(session.user.id, body?.templateId);
    if (!template) return NextResponse.json({ error: 'A routine template you own is required.' }, { status: 400 });
    if (typeof body?.title !== 'string' || !body.title.trim() || !validTime(body.startTime) || !validTime(body.endTime)) {
      return NextResponse.json({ error: 'Title, start time, and end time are required.' }, { status: 400 });
    }
    const isOvernight = Boolean(body.isOvernight) || body.endTime <= body.startTime;
    const candidate = { startTime: body.startTime, endTime: body.endTime, isOvernight };
    const existing = await prisma.routineBlock.findMany({
      where: { templateId: template.id }, select: { id: true, startTime: true, endTime: true, isOvernight: true },
    });
    if (!body.allowConflict && findRoutineConflicts(candidate, existing).length > 0) {
      return NextResponse.json({ error: 'This block overlaps an existing block in this template.' }, { status: 409 });
    }
    const categoryId = await categoryIdFor(session.user.id, body.category);
    const block = await prisma.routineBlock.create({
      data: {
        userId: session.user.id, templateId: template.id, title: body.title.trim(), startTime: body.startTime, endTime: body.endTime,
        isOvernight, categoryId, sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : existing.length,
        trackCompletion: Boolean(body.trackCompletion),
      }, include: { category: true },
    });
    return NextResponse.json({ success: true, data: serializeBlock(block) }, { status: 201 });
  } catch (error) {
    console.error('POST /api/routine error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create routine block.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Routine block id is required.' }, { status: 400 });
    const current = await prisma.routineBlock.findFirst({ where: { id: body.id, userId: session.user.id } });
    if (!current) return NextResponse.json({ error: 'Routine block not found.' }, { status: 404 });
    const startTime = body.startTime ?? current.startTime;
    const endTime = body.endTime ?? current.endTime;
    if (!validTime(startTime) || !validTime(endTime)) return NextResponse.json({ error: 'Times must use HH:mm format.' }, { status: 400 });
    const isOvernight = body.isOvernight === undefined ? current.isOvernight : Boolean(body.isOvernight);
    const peers = await prisma.routineBlock.findMany({
      where: { templateId: current.templateId }, select: { id: true, startTime: true, endTime: true, isOvernight: true },
    });
    if (!body.allowConflict && findRoutineConflicts({ id: current.id, startTime, endTime, isOvernight }, peers).length > 0) {
      return NextResponse.json({ error: 'This block overlaps an existing block in this template.' }, { status: 409 });
    }
    const categoryId = body.category === undefined ? current.categoryId : await categoryIdFor(session.user.id, body.category);
    const block = await prisma.routineBlock.update({
      where: { id: current.id },
      data: {
        ...(typeof body.title === 'string' ? { title: body.title.trim() } : {}), startTime, endTime, isOvernight, categoryId: categoryId ?? null,
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) } : {}),
        ...(body.trackCompletion !== undefined ? { trackCompletion: Boolean(body.trackCompletion) } : {}),
      }, include: { category: true },
    });
    return NextResponse.json({ success: true, data: serializeBlock(block) });
  } catch (error) {
    console.error('PUT /api/routine error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update routine block.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await request.json();
    const block = await prisma.routineBlock.findFirst({ where: { id, userId: session.user.id } });
    if (!block) return NextResponse.json({ error: 'Routine block not found.' }, { status: 404 });
    await prisma.routineBlock.delete({ where: { id: block.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/routine error:', error);
    return NextResponse.json({ error: 'Failed to delete routine block.' }, { status: 500 });
  }
}
