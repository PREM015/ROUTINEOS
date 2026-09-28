import { NextResponse } from 'next/server';
import { pushService } from '@/server/services/push.service';

/**
 * GET /api/push-config
 * Public VAPID key so authenticated clients can subscribe. The private key is
 * never exposed; enabled reflects whether VAPID is configured server-side.
 * A 503 is returned when push is not configured so clients can stay silent.
 */
export async function GET() {
  const publicKey = pushService.publicKey;
  if (!publicKey) {
    return NextResponse.json(
      { success: false, error: 'Push not configured', data: { enabled: false } },
      { status: 503 }
    );
  }
  return NextResponse.json({
    success: true,
    data: {
      enabled: true,
      publicKey,
      /**
       * Alias for `publicKey`.
       *
       * The notifications settings page read `vapidPublicKey` while this route
       * only ever returned `publicKey`, so the value was `undefined` on a 200
       * response. The page then showed "VAPID key not configured. Check server
       * environment." and the "Enable Push Notifications" button could never
       * register a device. Both names are returned so either client spelling
       * works; the duplicate costs nothing and removes the mismatch as a
       * failure mode.
       */
      vapidPublicKey: publicKey,
    },
  });
}
