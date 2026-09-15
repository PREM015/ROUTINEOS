import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const UpdateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const category = await db.category.findUnique({ where: { id: params.id } });
    if (!category) return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    if (category.userId !== session.user.id && !category.isSystem) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const category = await db.category.findUnique({ where: { id: params.id } });
    if (!category || category.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden or Not Found' }, { status: 403 });
    }

    const json = await req.json();
    const data = UpdateCategorySchema.parse(json);

    const updated = await db.category.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const category = await db.category.findUnique({ where: { id: params.id } });
    if (!category || category.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden or Not Found' }, { status: 403 });
    }

    await db.category.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
