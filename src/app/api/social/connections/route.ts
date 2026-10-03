import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';

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

    const { mutual, suggestions } = await socialService.connections(session.user.id);

    const data = {
      mutual,
      suggestions: suggestions.map((suggestion) => ({
        id: suggestion.id,
        name: suggestion.name,
        displayName: suggestion.displayName,
        avatarUrl: suggestion.avatarUrl,
        bio: suggestion.bio,
      })),
    };

    return NextResponse.json({
      success: true,
      data,
      meta: {
        mutual: data.mutual.length,
        // Counted from the response body, not from the pre-map list. The two
        // were the same array here, but they stop being the same the moment
        // anything is filtered — and the service does filter, to keep the viewer
        // out of their own suggestions.
        suggestions: data.suggestions.length,
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
