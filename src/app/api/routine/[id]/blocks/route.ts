import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocks = await db.routineBlock.findMany({
    where: { templateId: params.id, template: { userId: session.user.id } },
    orderBy: { startTime: 'asc' }
  });

  return NextResponse.json(blocks);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = createBlockSchema.parse(body);

    const template = await db.routineTemplate.findUnique({
      where: { id: params.id, userId: session.user.id }
    });

    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const block = await db.routineBlock.create({
      data: {
        ...data,
        templateId: params.id
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
