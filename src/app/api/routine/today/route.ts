import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDayTypeForDate, getTemplateForDate } from "@/lib/routine/templates";
import { format } from "date-fns";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = format(new Date(), 'yyyy-MM-dd');
  const timezone = 'UTC'; // Or from user settings

  try {
    const templates = await db.routineTemplate.findMany({
      where: { userId: session.user.id, isActive: true },
      include: { blocks: { orderBy: { startTime: 'asc' } } }
    });

    const exceptions = await db.routineException.findMany({
      where: { userId: session.user.id, date }
    });

    // @ts-ignore - DB types vs our local types might have slight mismatches but structure is same
    const todayTemplate = getTemplateForDate(templates, date, exceptions, timezone);

    if (!todayTemplate) {
      return NextResponse.json({ template: null, blocks: [], logs: [] });
    }

    const logs = await db.routineLog.findMany({
      where: { 
        userId: session.user.id,
        date,
        blockId: { in: todayTemplate.blocks.map(b => b.id) }
      }
    });

    return NextResponse.json({
      template: todayTemplate,
      blocks: todayTemplate.blocks,
      logs
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
