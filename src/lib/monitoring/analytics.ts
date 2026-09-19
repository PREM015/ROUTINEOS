/**
 * Client analytics helpers.
 *
 * Ships events to Vercel Analytics via `@vercel/analytics` `track`. The bridge
 * is lazy and guarded: `trackEvent` is safe to call before hydration, when the
 * package is unavailable, or during SSR — it simply no-ops instead of throwing.
 */

import type { AnalyticsProps } from '@vercel/analytics';

/** Values allowed by the Vercel Analytics `track` properties argument. */
export type AllowedPropertyValue = string | number | boolean | null | undefined;

export type TrackPayload = Record<string, AllowedPropertyValue>;

/** `flags` input accepted by `track` (mirrors the package's FlagsDataInput). */
export type FlagsInput =
  | (string | Record<string, unknown>)[]
  | Record<string, unknown>;

export interface TrackEventOptions {
  flags?: FlagsInput;
}

/**
 * Track a custom analytics event.
 *
 * @example
 * trackEvent('habit_checked', { habitId, tier })
 */
export function trackEvent(
  eventName: string,
  payload?: TrackPayload,
  options?: { flags?: FlagsInput }
): void {
  if (typeof document === 'undefined') return;

  void loadAnalytics().then((analytics) => {
    try {
      analytics.track(eventName, payload, { flags: options?.flags });
    } catch (error) {
      console.error('[routineos:analytics] track failed', error);
    }
  });
}

/**
 * Track a page-view milestone event with minimal additional data.
 */
export function trackPageView(pageName: string): void {
  trackEvent('page_view', { page: pageName });
}

/**
 * Track a feature interaction (button click, toggle, ...).
 */
export function trackInteraction(
  feature: string,
  action: string,
  detail?: TrackPayload
): void {
  trackEvent('interaction', { feature, action, ...detail });
}

/**
 * Track an exception surfaced to the client-side error boundary.
 */
export function trackError(
  message: string,
  context: Record<string, AllowedPropertyValue> = {
    page:
      typeof window !== 'undefined' ? window.location.pathname : 'ssr',
  }
): void {
  trackEvent('client_error', { message, ...context });
}

/**
 * Config for the injected Vercel Analytics script (mode, debug, etc.).
 * Re-exported so consumers can pass the same object to `<Analytics .../>`.
 */
export type { AnalyticsProps };

// ---------------------------------------------------------------------------
// Lazy, memoized bridge
// ---------------------------------------------------------------------------

type AnalyticsModule = Pick<typeof import('@vercel/analytics'), 'track'>;

let analyticsPromise: Promise<AnalyticsModule> | null = null;

function loadAnalytics(): Promise<AnalyticsModule> {
  if (analyticsPromise) return analyticsPromise;
  analyticsPromise = import('@vercel/analytics').catch((error) => {
    analyticsPromise = null;
    console.warn(
      '[routineos:analytics] failed to load @vercel/analytics',
      error
    );
    // Minimal no-op module so callers never `.then` into a null reference.
    return { track: (): undefined => undefined };
  });
  return analyticsPromise;
}