/**
 * Billing constants.
 *
 * The Stripe customer portal is managed entirely outside the app, so the
 * settings pages need to know whether it is configured before offering a link.
 * `STRIPE_SECRET_KEY` is a server-only variable and is never exposed to the
 * client; the check is mirrored in `src/app/api/billing/config/route.ts` for
 * the runtime path.
 */

export const BILLING_SUPPORT_EMAIL = 'billing@routineos.app';

/**
 * Whether Stripe billing is configured for this environment.
 *
 * Evaluated at build time from public-safe signals only. The authoritative
 * runtime check is `GET /api/billing/config`.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_ENABLED === 'true');
}
