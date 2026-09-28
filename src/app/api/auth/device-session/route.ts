import { auth } from '@/lib/auth';
import { UserService } from '@/server/services/user.service';
import { DeviceType } from '@/generated/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const registerSchema = z.object({
  deviceId: z.string().min(8, 'deviceId must be a stable client identifier').max(64),
  deviceName: z.string().max(120).optional().nullable(),
  deviceType: z.nativeEnum(DeviceType).optional().nullable(),
});

/** Best-effort client IP from the usual proxy headers. */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    null
  );
}

/**
 * POST /api/auth/device-session
 *
 * Registers (or refreshes) the calling device's `DeviceSession` row.
 *
 * NextAuth runs the `jwt` strategy, so the framework never writes a session
 * row of its own — before this route existed the `DeviceSession` table was
 * orphaned and `/settings/sessions` was permanently empty, making its Revoke
 * button unreachable. The client calls this once per browser (keyed on a
 * localStorage `deviceId`) and then throttled, to keep `lastActiveAt` fresh.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const validated = registerSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userService = new UserService();
    const record = await userService.registerDeviceSession(session.user.id, {
      deviceId: validated.data.deviceId,
      deviceName: validated.data.deviceName ?? null,
      deviceType: validated.data.deviceType ?? null,
      userAgent: request.headers.get('user-agent'),
      ipAddress: clientIp(request),
    });

    return NextResponse.json({
      success: true,
      data: { id: record.id, lastActiveAt: record.lastActiveAt },
    });
  } catch (error) {
    console.error('Error registering device session:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to register device session' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/device-session
 *
 * Removes this browser's session row on sign-out, so the device does not
 * linger in `/settings/sessions` after the user logs out.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const validated = registerSchema.pick({ deviceId: true }).safeParse(body);
    if (!validated.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const userService = new UserService();
    const existing = await userService.getDeviceSession(
      session.user.id,
      validated.data.deviceId
    );
    if (existing) {
      await userService.revokeSession(session.user.id, existing.id);
    }

    return NextResponse.json({ success: true, data: { revoked: Boolean(existing) } });
  } catch (error) {
    console.error('Error clearing device session:', error);
    return NextResponse.json(
      { error: 'Failed to clear device session' },
      { status: 500 }
    );
  }
}
