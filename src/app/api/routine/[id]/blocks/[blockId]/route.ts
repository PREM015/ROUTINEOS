import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string, blockId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, blockId } = await params;
  try {
    const body = await req.json();
    const data = updateBlockSchema.parse(body);

    const block = await db.routineBlock.findUnique({
      where: { id: blockId },
      include: { template: true }
    });

    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    if (block.template.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (block.templateId !== id) {
      return NextResponse.json({
        error: "Block belongs to a different template",
        detail: `block.templateId=${block.templateId} does not match URL param id=${id}`,
      }, { status: 409 });
    }

    const updatedBlock = await db.routineBlock.update({
      where: { id: blockId },
      data
    });

    return NextResponse.json(updatedBlock);
  } catch (error) {
    return NextResponse.json({ error: "Invalid data or error" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string, blockId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, blockId } = await params;
  try {
    const block = await db.routineBlock.findUnique({
      where: { id: blockId },
      include: { template: true }
    });

    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    if (block.template.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (block.templateId !== id) {
      return NextResponse.json({
        error: "Block belongs to a different template",
        detail: `block.templateId=${block.templateId} does not match URL param id=${id}`,
      }, { status: 409 });
    }

    await db.routineBlock.delete({
      where: { id: blockId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
