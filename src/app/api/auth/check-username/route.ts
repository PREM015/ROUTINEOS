import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const checkUsernameSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters').max(50, 'Username must be 50 characters or less'),
});

/**
 * POST /api/auth/check-username
 * Check whether a username is still free. Matches against the user's name
 * and display name (there is no separate username column).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = checkUsernameSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const username = validated.data.username.trim();
    const userService = new UserService();
    const matches = await userService.searchUsers(username);

    const taken = matches.some(
      (user) =>
        user.name?.toLowerCase() === username.toLowerCase() ||
        user.displayName?.toLowerCase() === username.toLowerCase()
    );

    return NextResponse.json({ success: true, data: { available: !taken } });
  } catch (error) {
    console.error('Error checking username availability:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to check username availability' },
      { status: 500 }
    );
  }
}