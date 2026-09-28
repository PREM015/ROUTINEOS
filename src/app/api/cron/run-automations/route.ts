import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/cron-auth';
import prisma from '@/lib/prisma';
import { DEFAULT_TZ } from '@/lib/dates';
import { runTimeReachedAutomations } from '@/server/services/automation.service';

/**
 * GET /api/cron/run-automations
 *
 * Drives the `TIME_REACHED` automation trigger, which has no natural emitter in
 * request handling — it needs a clock. Runs hourly and matches on `HH:MM` in the
 * user's own timezone, so a 07:00 rule fires at 07:00 local.
 *
 * `HABIT_COMPLETED` and `SCORE_THRESHOLD` are emitted inline by the habit log
 * and score calculation respectively, and are not handled here.
 */

interface RouteContext {
  params: Promise<Record<string, never>>;
}

const DEFAULT_MAX_USERS = 200;

export async function GET(request: NextRequest, _context: RouteContext) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const maxUsers = Number(request.nextUrl.searchParams.get('maxUsers')) || DEFAULT_MAX_USERS;

    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: { id: true, settings: { select: { timezone: true } } },
      orderBy: { createdAt: 'asc' },
      take: maxUsers,
    });

    let fired = 0;
    let matched = 0;
    const errors: Array<{ userId: string; message: string }> = [];

    for (const user of users) {
      const timezone = user.settings?.timezone ?? DEFAULT_TZ;
      try {
        const result = await runTimeReachedAutomations(user.id, timezone);
        fired += result.fired;
        matched += result.matched;
      } catch (error) {
        errors.push({
          userId: user.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { usersScanned: users.length, matched, fired, errors },
    });
  } catch (error) {
    console.error('run automations cron failed', error);
    return NextResponse.json({ success: false, error: 'Cron job failed' }, { status: 500 });
  }
}
