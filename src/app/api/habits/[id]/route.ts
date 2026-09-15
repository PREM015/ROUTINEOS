import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateHabitSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  tier: z.enum(['CORE', 'SECONDARY', 'FLEX']).optional(),
  frequencyType: z.enum(['DAILY', 'SPECIFIC_WEEKDAYS', 'WEEKLY_TARGET', 'MONTHLY_TARGET', 'ONE_TIME', 'CUSTOM']).optional(),
  frequencyConfig: z.string().optional(),
  targetValue: z.number().optional(),
  targetUnit: z.string().optional(),
  timeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME']).optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const habit = await db.habit.findUnique({
    where: { id: params.id, userId: session.user.id },
    include: { stats: true }
  });

  if (!habit) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  return NextResponse.json(habit);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = updateHabitSchema.parse(body);

    const habit = await db.habit.update({
      where: { id: params.id, userId: session.user.id },
      data
    });

    return NextResponse.json(habit);
  } catch (error) {
    return NextResponse.json({ error: "Invalid data or internal error" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.habit.delete({
      where: { id: params.id, userId: session.user.id }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
