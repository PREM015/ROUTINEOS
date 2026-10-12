import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/require-session';
import { HabitService } from '@/server/services/habit.service';
import { HabitCatalogService } from '@/server/services/habit-catalog.service';
import { addFromDefinitionSchema } from '@/schemas/habit.schema';
import { handleError } from '@/lib/errors/error-handler';
import { ConflictError } from '@/lib/errors/app-error';

/**
 * POST /api/habits/from-definition
 *
 * Add a catalogue habit to **the caller's own** habits.
 *
 * The whole feature in one route. Three users can each add "Daily Steps" and
 * set 15,000 / 12,000 / 30 respectively: what happens here is a *copy* of the
 * suggestion into a new row owned by `userId` from the session, and after that
 * point the three rows share nothing. There is no code path in this handler (or
 * anywhere else) that later reads the definition back, so changing the
 * suggestion can never move a personal target, and one user's change can never
 * reach another's.
 *
 * `userId` is not accepted as a parameter, in the body or in the query — only
 * the session can supply it.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = addFromDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { definitionId, overrides } = parsed.data;
    const habitService = new HabitService();

    const definition = await new HabitCatalogService().getById(
      auth.auth.userId,
      definitionId
    );
    if (!definition) {
      // 404 for both "no such entry" and "inactive entry". A non-admin must not
      // be able to tell them apart.
      return NextResponse.json({ error: 'Habit definition not found' }, { status: 404 });
    }

    // Suggestions resolved, caller overrides applied on top.
    const resolved = HabitCatalogService.resolvePersonalValues(definition, overrides ?? {});

    /*
     * Names are unique per user, not globally. Two users adding "Daily Steps"
     * is the expected case and must not conflict; the *same* user adding it
     * twice is the conflict.
     */
    const clash = await habitService.findByName(auth.auth.userId, resolved.name);
    if (clash) {
      throw new ConflictError(
        `You already have a habit named "${resolved.name}". Edit that one instead.`
      );
    }

    const habit = await habitService.createHabit(auth.auth.userId, {
      name: resolved.name,
      description: resolved.description,
      tier: resolved.tier,
      trackingType: resolved.trackingType,
      direction: resolved.direction,
      targetValue: resolved.targetValue,
      unit: resolved.unit,
      targetCount: resolved.targetCount,
      frequencyType: resolved.frequencyType,
      frequencyValue: resolved.frequencyValue,
      intervalDays: resolved.intervalDays,
      timeOfDay: resolved.timeOfDay,
      icon: resolved.icon,
      color: resolved.color,
      sortOrder: overrides?.sortOrder ?? definition.sortOrder,
      startDate: overrides?.startDate ?? new Date(),
      reminderTime: overrides?.reminderTime ?? null,
      categoryId: overrides?.categoryId ?? undefined,
      // Provenance only. Nothing reads this after creation.
      definitionId: definition.id,
    });

    return NextResponse.json({ success: true, data: habit }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
