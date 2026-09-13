import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function isValidTime(value: unknown): boolean {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { settings: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      settings: user.settings,
    });
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const timezone = typeof body?.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : DEFAULT_TIMEZONE;
    const weekStartsOn = Number(body?.weekStartsOn ?? 1);
    const targetBedtime = body?.targetBedtime;
    const targetWakeTime = body?.targetWakeTime;
    const minSleepDuration = Number(body?.minSleepDuration ?? 0);

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { settings: true },
    });

    if (name) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { name },
      });
    }

    const payload = {
      timezone,
      weekStartsOn: Number.isInteger(weekStartsOn) && [0, 1].includes(weekStartsOn) ? weekStartsOn : currentUser?.settings?.weekStartsOn ?? 1,
      targetBedtime: isValidTime(targetBedtime) ? targetBedtime : currentUser?.settings?.targetBedtime ?? null,
      targetWakeTime: isValidTime(targetWakeTime) ? targetWakeTime : currentUser?.settings?.targetWakeTime ?? null,
      minSleepDuration: Number.isFinite(minSleepDuration) && minSleepDuration > 0 ? Math.round(minSleepDuration) : currentUser?.settings?.minSleepDuration ?? null,
    };

    const settings = await prisma.userSettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        ...payload,
      },
      update: payload,
    });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: session.user.id,
          name: name || currentUser?.name || null,
        },
        settings,
      },
    });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
