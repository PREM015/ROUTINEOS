import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const archiveSchema = z.object({
  reason: z.string().optional()
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = archiveSchema.parse(body);

    const habit = await db.habit.update({
      where: { id: params.id, userId: session.user.id },
      data: {
        status: 'ARCHIVED',
        archiveReason: data.reason,
        archivedAt: new Date()
      }
    });

    return NextResponse.json(habit);
  } catch (error) {
    return NextResponse.json({ error: "Invalid data or error" }, { status: 400 });
  }
}
