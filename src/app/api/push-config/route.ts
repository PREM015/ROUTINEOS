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
      { error: 'Push not configured', enabled: false },
      { status: 503 }
    );
  }
  return NextResponse.json({ enabled: true, publicKey });
}