import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let settings = await db.userSettings.findUnique({ where: { userId: session.user.id } });
    if (!settings) {
      settings = await db.userSettings.create({ data: { userId: session.user.id } });
    }
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await req.json();
    const updated = await db.userSettings.upsert({
      where: { userId: session.user.id },
      update: json,
      create: { userId: session.user.id, ...json },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}
