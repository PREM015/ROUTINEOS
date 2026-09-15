import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const skipSchema = z.object({
  date: z.string(),
  reason: z.string().optional()
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = skipSchema.parse(body);

    const habit = await db.habit.findUnique({
      where: { id: params.id, userId: session.user.id }
    });
    if (!habit) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    const override = await db.habitOverride.upsert({
      where: {
        habitId_date: {
          habitId: params.id,
          date: data.date
        }
      },
      update: {
        overrideType: 'SKIP',
        reason: data.reason
      },
      create: {
        habitId: params.id,
        userId: session.user.id,
        date: data.date,
        overrideType: 'SKIP',
        reason: data.reason
      }
    });

    return NextResponse.json(override);
  } catch (error) {
    return NextResponse.json({ error: "Invalid data or error" }, { status: 400 });
  }
}
