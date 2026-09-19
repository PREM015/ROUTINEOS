import { auth } from '@/lib/auth';
import { updateProfileSchema } from '@/lib/validation/user';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Shared handler for PATCH and PUT.
 * Updates the profile fields of the authenticated user.
 */
async function handleUpdateProfile(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = updateProfileSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const input: Record<string, unknown> = {};
    const data = validated.data;
    if (data.name !== undefined) input.name = data.name;
    if (data.displayName !== undefined) input.displayName = data.displayName;
    if (data.bio !== undefined) input.bio = data.bio;
    if (data.avatarUrl !== undefined) input.avatarUrl = data.avatarUrl;
    if (data.timezone !== undefined) input.timezone = data.timezone;
    if (data.preferredLanguage !== undefined) {
      input.preferredLanguage = data.preferredLanguage;
    }

    const userService = new UserService();
    const user = await userService.updateProfile(session.user.id, input);

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('Error updating profile:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/update-profile
 * Partially update the profile fields of the authenticated user.
 */
export async function PATCH(request: NextRequest) {
  return handleUpdateProfile(request);
}

/**
 * PUT /api/auth/update-profile
 * Replace the profile fields of the authenticated user.
 */
export async function PUT(request: NextRequest) {
  return handleUpdateProfile(request);
}