/**
 * Stripe Webhook Signature Verification
 * Pure crypto helper — no database access, no HTTP calls.
 *
 * Verifies the `stripe-signature` header against the raw request body using
 * Stripe's own HMAC verification. The payload MUST NOT be parsed (or trusted
 * in any way) before this succeeds: JSON round-tripping changes byte
 * offsets and invalidates the signature.
 *
 * @see https://docs.stripe.com/webhooks/signature
 */

import Stripe from 'stripe';

/**
 * Why verification failed. `NOT_CONFIGURED` means the server is missing
 * `STRIPE_WEBHOOK_SECRET` and cannot verify anything — a deployment error,
 * not a client error. Both reasons must fail closed.
 */
export type SignatureFailureReason = 'NOT_CONFIGURED' | 'INVALID_SIGNATURE';

export type SignatureVerificationResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; reason: SignatureFailureReason; message: string };

let stripeClient: Stripe | null = null;

/**
 * `constructEvent` is a local HMAC computation and never calls the Stripe
 * API, but the SDK still requires an apiKey to be constructible. When only
 * the webhook secret is provisioned we pass a syntactically valid placeholder
 * so signature verification still works.
 */
function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  stripeClient = new Stripe(
    apiKey && apiKey.length > 0 ? apiKey : 'sk_test_webhook_verification_placeholder'
  );
  return stripeClient;
}

/**
 * Verify a Stripe webhook signature over the raw body.
 *
 * @param rawBody Exact request body bytes as text, before any parsing.
 * @param signature Value of the `stripe-signature` request header.
 */
export function verifyStripeSignature(
  rawBody: string,
  signature: string
): SignatureVerificationResult {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      message: 'STRIPE_WEBHOOK_SECRET is not configured',
    };
  }

  if (!signature) {
    return {
      ok: false,
      reason: 'INVALID_SIGNATURE',
      message: 'Missing stripe-signature header',
    };
  }

  try {
    const event = getStripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
    return { ok: true, event };
  } catch (error) {
    return {
      ok: false,
      reason: 'INVALID_SIGNATURE',
      message:
        error instanceof Error ? error.message : 'Stripe signature verification failed',
    };
  }
}
