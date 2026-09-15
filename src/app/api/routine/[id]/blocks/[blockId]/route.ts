import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateBlockSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  type: z.enum(['WORK', 'REST', 'LEARNING', 'EXERCISE', 'ROUTINE', 'FLEX']).optional(),
  isFlex: z.boolean().optional()
});

export async function PUT(req: NextRequest, { params }: { params: { id: string, blockId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = updateBlockSchema.parse(body);

    const block = await db.routineBlock.findUnique({
      where: { id: params.blockId },
      include: { template: true }
    });

    if (!block || block.template.userId !== session.user.id || block.templateId !== params.id) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    const updatedBlock = await db.routineBlock.update({
      where: { id: params.blockId },
      data
    });

    return NextResponse.json(updatedBlock);
  } catch (error) {
    return NextResponse.json({ error: "Invalid data or error" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string, blockId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const block = await db.routineBlock.findUnique({
      where: { id: params.blockId },
      include: { template: true }
    });

    if (!block || block.template.userId !== session.user.id || block.templateId !== params.id) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    await db.routineBlock.delete({
      where: { id: params.blockId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
