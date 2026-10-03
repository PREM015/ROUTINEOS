import { auth } from '@/lib/auth';
import { RoutineService } from '@/server/services/routine.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { slugToDayType } from '@/constants/routine';
import {
  createRoutineBlockSchema,
  updateRoutineBlockSchema,
  deleteRoutineSchema,
  createRoutineTemplateRequestSchema,
  updateRoutineTemplateRequestSchema,
  applyTemplateToRangeSchema,
} from '@/lib/validation/routine.schema';
import { EditWindowError } from '@/lib/routine/edit-window';
import type { DayType } from '@/generated/prisma';

/**
 * The body fields that mean "this is a block update, not a template update".
 *
 * `categoryId` and `clearCategory` are in this list because clearing a category
 * is a block-level edit; without them `PUT {id, clearCategory: true}` fell
 * through to the template-update path and failed with "Routine template not
 * found".
 */
const BLOCK_UPDATE_FIELDS = [
  'title',
  'startTime',
  'endTime',
  'sortOrder',
  'trackCompletion',
  'energyLevel',
  'description',
  'notes',
  'color',
  'icon',
  'categoryId',
  'clearCategory',
] as const;

/**
 * Classify a template's day type.
 *
 * A template connected to a DayTypeDefinition only carries a coarse fallback in
 * its `dayType` column ('CUSTOM'), so the definition's slug is authoritative:
 * 'work-day' is WORKDAY, not the non-existent 'WORK_DAY'.
 */
function templateDayType(template: {
  dayType: DayType;
  dayTypeDef?: { slug: string } | null;
}): DayType {
  return template.dayTypeDef ? slugToDayType(template.dayTypeDef.slug) : template.dayType;
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
  notes?: string | null;
  energyLevel?: string | null;
  categoryId?: string | null;
  category?: { id?: string; name?: string; color?: string | null; icon?: string | null } | null;
  templateId?: string;
  template?: {
    id?: string;
    dayType?: string;
    dayTypeId?: string | null;
    isActive?: boolean;
  } | null;
  /** Resolved classification/identity, when the caller already derived them. */
  dayType?: DayType;
  dayTypeId?: string | null;
}) {
  return {
    id: block.id,
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    templateId: block.templateId ?? block.template?.id,
    dayType: block.dayType ?? block.template?.dayType ?? 'CUSTOM',
    dayTypeId: block.dayTypeId ?? block.template?.dayTypeId,
    /**
     * Both the raw FK and the projected row.
     *
     * The name alone is what let F5 hide: the create path accepted a category,
     * answered 201, and stored nothing, because the service read a field named
     * `category` while the client sent `categoryId`. Returning the id means an
     * editor can send the stored value back unchanged, and `null` to clear it.
     */
    categoryId: block.categoryId ?? block.category?.id ?? null,
    category: block.category
      ? {
          id: block.category.id,
          name: block.category.name ?? '',
          color: block.category.color ?? null,
          icon: block.category.icon ?? null,
        }
      : null,
    color: block.color ?? null,
    icon: block.icon ?? null,
    sortOrder: block.sortOrder,
    trackCompletion: block.trackCompletion,
    description: block.description ?? null,
    notes: block.notes ?? null,
    energyLevel: block.energyLevel ?? null,
  };
}

/**
 * Map a thrown error onto the right status.
 *
 * `EditWindowError` is a 403 rather than a 400 on purpose: the client's payload
 * is fine, the *window* has closed, and retrying with different data cannot
 * reopen it. Reporting 400 would invite the client to "fix" a payload that was
 * never wrong.
 */
function toErrorResponse(error: unknown, fallback: string) {
  console.error(error);
  if (error instanceof EditWindowError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
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
    // Was `routineService['routineRepository'].findAllTemplates(...)` - a route
    // reaching through a private field to get at the repository it already owns.
    const templates = await routineService.listTemplates(session.user.id);

    // Derive each template's classification from its day-type definition so the
    // list agrees with the single-block create response; otherwise a block added
    // to a 'work-day' tab would appear as WORKDAY until the next refresh, when
    // the stored 'CUSTOM' fallback took over again.
    const data = templates.map((template) => {
      const dayType = templateDayType(template);
      return {
        ...template,
        dayType,
        dayTypeId: template.dayTypeId ?? undefined,
        blocks: template.blocks.map((block) =>
          toBlockDto({ ...block, dayType, dayTypeId: template.dayTypeId } as never)
        ),
      };
    });

    return NextResponse.json({
      success: true,
      data,
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
 * auto-provisions a template for the given dayType or dayTypeId.
 *
 * An overlap with an existing block is reported as `warnings` alongside a 201.
 * It is never a rejection: stacking activities is a legitimate thing to want,
 * and a hard rejection made the page unusable for anyone who does it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.id;

    /*
     * Range application, checked before the block/template discrimination below
     * because it is the one action that is not a block write at all.
     *
     * Dispatched on the presence of `startDate` rather than on a new URL, so the
     * client's four routine writes stay four calls against one resource. The
     * discriminator is a field only this payload can have.
     */
    if (body && typeof body.startDate === 'string') {
      const validated = applyTemplateToRangeSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validated.error.flatten() },
          { status: 400 }
        );
      }

      const result = await new RoutineService().applyTemplateToRange(userId, validated.data);

      /*
       * 207 rather than 200 when part of the range was refused. A partial write
       * is not a success, and answering 200 here is how the UI would end up
       * claiming "done" over five dates out of seven. The body carries exactly
       * which dates were skipped and why.
       */
      const partial = result.skipped.length > 0 && result.applied.length > 0;
      const none = result.applied.length === 0;

      return NextResponse.json(
        {
          success: !none,
          data: result,
          ...(result.skipped.length > 0 && {
            error: `${result.skipped.length} of ${result.applied.length + result.skipped.length} dates were skipped`,
          }),
        },
        { status: none ? 409 : partial ? 207 : 200 }
      );
    }

    // Block shape takes precedence when `title` is present.
    if (body && typeof body.title === 'string') {
      const validated = createRoutineBlockSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validated.error.flatten() },
          { status: 400 }
        );
      }

      // Template resolution, auto-provisioning, overlap detection, the
      // `categoryId` ownership check and the per-template `sortOrder` all live
      // in `RoutineService.createBlockForDayType`.
      //
      // This used to run here, including three raw Prisma queries issued through
      // `routineRepository['prisma']` - a route handler reaching past the
      // repository layer to talk to the client directly, which is the failure
      // mode ERROR.md section 1 exists to close.
      const routineService = new RoutineService();
      const { data } = validated;
      const { block, template, warnings } =
        await routineService.createBlockForDayType(userId, {
          title: data.title,
          startTime: data.startTime,
          endTime: data.endTime,
          dayTypeId: data.dayTypeId ?? undefined,
          dayType: data.dayType ?? undefined,
          categoryId: data.categoryId ?? undefined,
          description: data.description ?? undefined,
          notes: data.notes ?? undefined,
          color: data.color ?? undefined,
          icon: data.icon ?? undefined,
          sortOrder: data.sortOrder,
          trackCompletion: data.trackCompletion,
          energyLevel: data.energyLevel ?? undefined,
          // F6: the retroactive-edit-window context. `null` becomes `undefined`
          // so "no date in play" stays absent rather than becoming a string.
          date: data.date ?? undefined,
        });

      // Get the dayType for the response - prefer dayTypeDef's slug or template's dayType
      const responseDayType = await routineService.resolveBlockDayType(template);

      return NextResponse.json(
        {
          success: true,
          data: {
            ...toBlockDto({
              ...block,
              dayType: responseDayType,
              dayTypeId: template.dayTypeId,
            } as never),
            warnings,
          },
        },
        { status: 201 }
      );
    }

    const validated = createRoutineTemplateRequestSchema.safeParse(body);

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
    return toErrorResponse(error, 'Failed to create routine template');
  }
}

/**
 * PUT /api/routine
 * Update a routine block by { id, ...fields } (block ids take precedence),
 * falling back to template update ({ id, name, ... }).
 *
 * A time clash comes back as `warnings` beside a 200, exactly as on create.
 * This path previously performed no overlap check at all, so a resize could
 * silently create a timetable the server would then refuse to render.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.id;
    const routineService = new RoutineService();

    // Route to block-update when the body contains an id AND any block-level
    // field. Previously only `title` was checked, which caused sortOrder-only
    // updates (a nudge) to fall through to the template-update path and fail
    // with "Routine template not found".
    const isBlockUpdate =
      body && typeof body.id === 'string' && BLOCK_UPDATE_FIELDS.some((field) => field in body);

    if (isBlockUpdate) {
      const validated = updateRoutineBlockSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validated.error.flatten() },
          { status: 400 }
        );
      }

      // `dayType` / `dayTypeId` are accepted on the wire for the client's
      // convenience but are *not* writable here: moving a block between day
      // types is a template-level operation, and silently honouring them would
      // leave the block in a template the caller did not name.
      //
      // `date` stays in `fields` on purpose (F6). It is not a `RoutineBlock`
      // column; `updateBlockForUser` destructures it out, asserts the
      // retroactive edit window against it, and never forwards it to the
      // repository. Destructuring it here and passing it back would be the same
      // code with more steps.
      const {
        id,
        dayType: _dayType,
        dayTypeId: _dayTypeId,
        clearCategory,
        ...fields
      } = validated.data;

      const existing = await routineService.updateBlockForUser(userId, id, {
        ...fields,
        ...(clearCategory !== undefined && { clearCategory }),
      });

      return NextResponse.json({
        success: true,
        data: {
          ...toBlockDto({
            ...existing.block,
            dayType: templateDayType(existing.template),
            dayTypeId: existing.template.dayTypeId,
          } as never),
          warnings: existing.warnings,
        },
      });
    }

    // Template update fallback.
    const validated = updateRoutineTemplateRequestSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }
    const { id, ...fields } = validated.data;
    const updated = await routineService.updateTemplateForUser(userId, id, fields);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return toErrorResponse(error, 'Failed to update routine');
  }
}

/**
 * DELETE /api/routine
 * Delete a routine block ({ id }) or template by id.
 *
 * Deleting the last block of a template leaves the template in place. See
 * `RoutineService.deleteById` for why the block is resolved first.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const validated = deleteRoutineSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    // The same id shape is accepted for a block or a template; the service
    // resolves which one it is. Both lookups used to be raw
    // `routineRepository['prisma']` queries issued from this handler.
    const deleted = await new RoutineService().deleteById(
      userId,
      validated.data.id,
      validated.data.date
    );
    return NextResponse.json({ success: true, data: { deleted } });
  } catch (error) {
    return toErrorResponse(error, 'Failed to delete routine');
  }
}