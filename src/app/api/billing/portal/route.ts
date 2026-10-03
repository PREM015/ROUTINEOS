import { auth } from '@/lib/auth';
import { subscriptionService } from '@/server/services/subscription.service';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/billing/portal
 * Create a Stripe customer-portal session and return its URL.
 *
 * Stripe's portal is a hosted page reached through a short-lived session, so it
 * cannot be a plain link. The two settings pages previously shipped a
 * permanently-disabled "Manage subscription" button whose tooltip was the
 * entire feature.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let returnUrl = '/settings/billing';
    try {
      const body = await request.json();
      if (body?.returnUrl && typeof body.returnUrl === 'string') {
        returnUrl = body.returnUrl;
      }
    } catch {
      // Optional body; the default is fine.
    }

    // Open-redirect guard. Stripe renders this URL in its own browser after
    // the user finishes, so an unvalidated absolute URL would turn this
    // authenticated endpoint into a redirector for any site. Only same-origin
    // *paths* are accepted; anything with a scheme or a leading `//` is
    // discarded in favour of the default.
    const safeReturnUrl =
      /^\/(?!\/)/.test(returnUrl) && !returnUrl.includes('://')
        ? returnUrl
        : '/settings/billing';

    const result = await subscriptionService.createPortalSession(
      userIdFromSession(session),
      safeReturnUrl
    );

    if (!result.ok) {
      // 400 for "you cannot use this", 503 for "the server cannot".
      const status = result.reason === 'NOT_CONFIGURED' ? 503 : 400;
      return NextResponse.json({ error: result.message }, { status });
    }

    return NextResponse.json({ success: true, data: { url: result.url } });
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    return NextResponse.json(
      { error: 'Failed to open the billing portal' },
      { status: 500 }
    );
  }
}
