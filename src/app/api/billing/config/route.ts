import { NextResponse } from 'next/server';

/**
 * GET /api/billing/config
 *
 * Whether Stripe billing is configured, plus the public key needed by the
 * client. Read at runtime so rotating keys does not require a rebuild.
 *
 * The portal itself is hosted by Stripe; the app never proxies it.
 */
export async function GET() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

  return NextResponse.json({
    success: true,
    data: {
      configured: Boolean(secretKey),
      publishableKey,
    },
  });
}
