import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { RoutineRepository } from '@/server/repositories/routine.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timeToMinutes } from '@/lib/dates';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  dayType: z.enum(['WORKDAY', 'WEEKEND', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM']),
  isDefault: z.boolean().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Standalone routine block shape (used by AppContext / Today / Routine pages).
// A block is stored under a per-dayType template that is auto-provisioned.
const createBlockSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  startTime: z.string().regex(HH_MM, 'Start time must be HH:mm'),
  endTime: z.string().regex(HH_MM, 'End time must be HH:mm'),
  dayType: z
    .enum(['WORKDAY', 'WEEKEND', 'WEEKDAY', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'])
    .optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  trackCompletion: z.boolean().optional(),
  description: z.string().optional(),
  energyLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
});

const updateBlockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(100).optional(),
  startTime: z.string().regex(HH_MM, 'Start time must be HH:mm').optional(),
  endTime: z.string().regex(HH_MM, 'End time must be HH:mm').optional(),
  dayType: z
    .enum(['WORKDAY', 'WEEKEND', 'WEEKDAY', 'HOLIDAY', 'EXAM_DAY', 'LOW_ENERGY', 'CUSTOM'])
    .optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  trackCompletion: z.boolean().optional(),
  description: z.string().optional(),
  energyLevel: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
});

const deleteBlockSchema = z.object({ id: z.string().min(1) });

/** Map client day labels onto the Prisma DayType enum. */
function toDayType(dayType?: string): 'WORKDAY' | 'WEEKEND' | 'HOLIDAY' | 'EXAM_DAY' | 'LOW_ENERGY' | 'CUSTOM' {
  switch (dayType) {
    case 'WORKDAY':
    case 'WEEKDAY':
      return 'WORKDAY';
    case 'WEEKEND':
      return 'WEEKEND';
    case 'HOLIDAY':
      return 'HOLIDAY';
    case 'EXAM_DAY':
      return 'EXAM_DAY';
    case 'LOW_ENERGY':
      return 'LOW_ENERGY';
    default:
      return 'CUSTOM';
  }
}

function toBlockDto(block: {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  color?: string | null;
  icon?: string | null;
  sortOrder: number;
  trackCompletion: boolean;
  description?: string | null;
  energyLevel?: string | null;
  category?: { name?: string } | null;
  template?: { dayType?: string } | null;
}) {
  return {
    id: block.id,
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    dayType: block.template?.dayType ?? 'CUSTOM',
    category: block.category?.name,
    color: block.color ?? undefined,
    icon: block.icon ?? undefined,
    sortOrder: block.sortOrder,
    trackCompletion: block.trackCompletion,
    description: block.description ?? undefined,
    energyLevel: block.energyLevel ?? undefined,
  };
}

/**
 * GET /api/routine
 * Get all routine templates for user (templates include their blocks).
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const routineService = new RoutineService();
    const templates = await routineService['routineRepository'].findAllTemplates(
      session.user.id
    );

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Error fetching routine templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch routine templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/routine
 * Create a routine template ({ name, dayType, ... }) OR a standalone
 * routine block ({ title, startTime, endTime, ... }). Block creation
 * auto-provisions a template for the given dayType.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.id;

    // Block shape takes precedence when `title` is present.
    if (body && typeof body.title === 'string') {
      const validated = createBlockSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validated.error.flatten() },
          { status: 400 }
        );
      }

      const start = timeToMinutes(validated.data.startTime);
      const end = timeToMinutes(validated.data.endTime);
      const isOvernight = end <= start;

      const routineRepository = new RoutineRepository();
      const dayType = toDayType(validated.data.dayType);

      let template = await routineRepository.findTemplateByDayType(userId, dayType);
      if (!template) {
        template = await routineRepository.createTemplate({
          user: { connect: { id: userId } },
          name: `${dayType.charAt(0)}${dayType.slice(1).toLowerCase()} routine`,
          dayType,
          isDefault: true,
        });
      }

      const existing = await routineRepository['prisma'].routineBlock.findMany({
        where: { templateId: template.id },
        select: { startTime: true, endTime: true },
      });
      const overlaps = existing.some((b) => {
        const s = timeToMinutes(b.startTime);
        const e = timeToMinutes(b.endTime);
        if (isOvernight || e <= s) return false;
        return start < e && s < end;
      });

      const siblingCount = await routineRepository['prisma'].routineBlock.count({
        where: { templateId: template.id },
      });

      const block = await routineRepository.createBlock({
        user: { connect: { id: userId } },
        template: { connect: { id: template.id } },
        title: validated.data.title,
        description: validated.data.description,
        startTime: validated.data.startTime,
        endTime: validated.data.endTime,
        isOvernight,
        color: validated.data.color,
        icon: validated.data.icon,
        sortOrder: validated.data.sortOrder ?? siblingCount,
        trackCompletion: validated.data.trackCompletion ?? true,
        energyLevel: validated.data.energyLevel,
      });

      return NextResponse.json(
        {
          success: true,
          data: { ...toBlockDto({ ...block, template: { dayType } } as never), ...(overlaps ? { overlapWarning: true } : {}) },
        },
        { status: 201 }
      );
    }

    const validated = createTemplateSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const routineService = new RoutineService();
    const template = await routineService.createTemplate(
      session.user.id,
      validated.data
    );

    return NextResponse.json(
      { success: true, data: template },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating routine template:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to create routine template' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/routine
 * Update a routine block by { id, ...fields } (block ids take precedence),
 * falling back to template update ({ id, name, ... }).
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.id;
    const routineRepository = new RoutineRepository();

    if (body && typeof body.title === 'string') {
      const validated = updateBlockSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validated.error.flatten() },
          { status: 400 }
        );
      }
      const { id, dayType: _dayType, category: _category, ...fields } = validated.data;

      if (fields.startTime && fields.endTime) {
        const start = timeToMinutes(fields.startTime);
        const end = timeToMinutes(fields.endTime);
        (fields as Record<string, unknown>).isOvernight = end <= start;
      }

      const existing = await routineRepository['prisma'].routineBlock.findFirst({
        where: { id, userId },
        include: { template: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'Routine block not found' }, { status: 404 });
      }
      const updated = await routineRepository['prisma'].routineBlock.update({
        where: { id },
        data: fields as never,
      });
      return NextResponse.json({
        success: true,
        data: toBlockDto({ ...updated, template: existing.template } as never),
      });
    }

    // Template update fallback.
    const templateSchema = z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      isDefault: z.boolean().optional(),
    });
    const validated = templateSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }
    const { id, ...fields } = validated.data;
    const owned = await routineRepository['prisma'].routineTemplate.findFirst({
      where: { id, userId },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Routine template not found' }, { status: 404 });
    }
    const updated = await routineRepository['prisma'].routineTemplate.update({
      where: { id },
      data: fields,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating routine:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update routine' }, { status: 500 });
  }
}

/**
 * DELETE /api/routine
 * Delete a routine block ({ id }) or template by id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = deleteBlockSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const routineRepository = new RoutineRepository();

    const block = await routineRepository['prisma'].routineBlock.findFirst({
      where: { id: validated.data.id, userId },
    });
    if (block) {
      await routineRepository['prisma'].routineBlock.delete({
        where: { id: validated.data.id },
      });
      return NextResponse.json({ success: true });
    }

    const template = await routineRepository['prisma'].routineTemplate.findFirst({
      where: { id: validated.data.id, userId },
    });
    if (!template) {
      return NextResponse.json({ error: 'Routine not found' }, { status: 404 });
    }
    await routineRepository['prisma'].routineTemplate.delete({
      where: { id: validated.data.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting routine:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to delete routine' }, { status: 500 });
  }
}
