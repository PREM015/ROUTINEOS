import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { SocialRepository } from '@/server/repositories/social.repository';

/**
 * GET /api/social/connections
 * List mutual connections and suggested users to follow.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const repository = new SocialRepository();
    const [mutual, suggestions] = await Promise.all([
      repository.mutualConnections(session.user.id),
      repository.suggestions(session.user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        mutual,
        suggestions: suggestions.map((suggestion) => ({
          id: suggestion.id,
          name: suggestion.name,
          displayName: suggestion.displayName,
          avatarUrl: suggestion.avatarUrl,
          bio: suggestion.bio,
        })),
      },
      meta: {
        mutual: mutual.length,
        suggestions: suggestions.length,
      },
    });
  } catch (error) {
    console.error('Error fetching connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    );
  }
}