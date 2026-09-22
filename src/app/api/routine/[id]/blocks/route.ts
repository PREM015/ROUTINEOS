import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createBlockSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  type: z.enum(['WORK', 'REST', 'LEARNING', 'EXERCISE', 'ROUTINE', 'FLEX']),
  isFlex: z.boolean().optional()
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const blocks = await db.routineBlock.findMany({
    where: { templateId: id, template: { userId: session.user.id } },
    orderBy: { startTime: 'asc' }
  });

  return NextResponse.json(blocks);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await req.json();
    const data = createBlockSchema.parse(body);

    const template = await db.routineTemplate.findUnique({
      where: { id, userId: session.user.id }
    });

    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const { type: _type, isFlex: _isFlex, ...blockData } = data;

    const block = await db.routineBlock.create({
      data: {
        ...blockData,
        user: { connect: { id: session.user.id } },
        template: { connect: { id } }
      }
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
