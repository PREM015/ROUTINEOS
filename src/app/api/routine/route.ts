import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  dayType: z.enum(['WORKDAY', 'WEEKEND', 'HOLIDAY', 'CUSTOM']),
  isDefault: z.boolean().optional().default(false)
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const templates = await db.routineTemplate.findMany({
      where: { userId: session.user.id },
      include: {
        blocks: {
          orderBy: { startTime: 'asc' }
        }
      }
    });
    return NextResponse.json(templates);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching routines" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = createTemplateSchema.parse(body);

    if (data.isDefault) {
      await db.routineTemplate.updateMany({
        where: { userId: session.user.id, dayType: data.dayType, isDefault: true },
        data: { isDefault: false }
      });
    }

    const template = await db.routineTemplate.create({
      data: {
        ...data,
        userId: session.user.id
      }
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
