import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  dayType: z.enum(['WORKDAY', 'WEEKEND', 'HOLIDAY', 'CUSTOM']).optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await db.routineTemplate.findUnique({
    where: { id: params.id, userId: session.user.id },
    include: { blocks: { orderBy: { startTime: 'asc' } } }
  });

  if (!template) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = updateTemplateSchema.parse(body);

    if (data.isDefault) {
      const currentTemplate = await db.routineTemplate.findUnique({ where: { id: params.id } });
      if (currentTemplate) {
        await db.routineTemplate.updateMany({
          where: { userId: session.user.id, dayType: data.dayType || currentTemplate.dayType, isDefault: true },
          data: { isDefault: false }
        });
      }
    }

    const template = await db.routineTemplate.update({
      where: { id: params.id, userId: session.user.id },
      data
    });

    return NextResponse.json(template);
  } catch (error) {
    return NextResponse.json({ error: "Invalid data or error" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await db.routineTemplate.delete({
      where: { id: params.id, userId: session.user.id }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
