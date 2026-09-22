import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import type { DayType } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';

const DAY_TYPES: DayType[] = ['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const date = new URL(request.url).searchParams.get('date');
  const records = await prisma.routineException.findMany({
    where: { userId: session.user.id, ...(date ? { date } : {}) }, include: { template: true }, orderBy: { date: 'desc' },
  });
  return NextResponse.json({ success: true, data: records });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    if (!DATE.test(body?.date) || !DAY_TYPES.includes(body?.dayType)) return NextResponse.json({ error: 'A valid date and day type are required.' }, { status: 400 });
    if (body.templateId) {
      const template = await prisma.routineTemplate.findFirst({ where: { id: body.templateId, userId: session.user.id } });
      if (!template) return NextResponse.json({ error: 'Routine template not found.' }, { status: 404 });
    }
    const data = await prisma.routineException.upsert({
      where: { userId_date: { userId: session.user.id, date: body.date } },
      create: { userId: session.user.id, date: body.date, dayType: body.dayType, templateId: body.templateId ?? null, note: body.note?.trim() || null },
      update: { dayType: body.dayType, templateId: body.templateId ?? null, note: body.note?.trim() || null },
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/routine/exceptions error:', error);
    return NextResponse.json({ error: 'Failed to save routine exception.' }, { status: 500 });
  }
}
