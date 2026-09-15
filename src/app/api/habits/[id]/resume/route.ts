import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const habit = await db.habit.update({
      where: { id: params.id, userId: session.user.id },
      data: {
        status: 'ACTIVE',
        pausedUntil: null,
        pauseReason: null
      }
    });

    return NextResponse.json(habit);
  } catch (error) {
    return NextResponse.json({ error: "Error resuming habit" }, { status: 500 });
  }
}
