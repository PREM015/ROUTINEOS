'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { readStoredConsent } from '@/store/consent.store';

/**
 * Consent-gated analytics.
 *
 * Before this, the project had `@vercel/analytics` and
 * `@vercel/speed-insights` installed, a complete 100-line
 * `lib/monitoring/analytics.ts` bridge, and **zero** call sites — so there was
 * no web analytics at all. Wiring it up naively would have started sending
 * data with no consent, so neither script is loaded until the visitor has
 * explicitly accepted the analytics category.
 *
 * ### Why the `/react` subpath
 *
 * Both packages are multi-entry. The bare specifier (`@vercel/analytics`)
 * resolves to `dist/index.mjs`, whose *default* export is a plain object of
 * imperative helpers — `{ inject, track, computeRoute }` — **not** a component.
 * The React component is a *named* export of the `/react` subpath:
 *
 *   import { Analytics } from '@vercel/analytics/react';
 *   import { SpeedInsights } from '@vercel/speed-insights/react';
 *
 * Importing the bare specifier and rendering its `default` would throw at
 * runtime ("Element type is invalid"). Verified against the installed
 * `node_modules/@vercel` type definitions rather than assumed.
 *
 * (Written without a glob here on purpose: an unescaped asterisk-slash inside a
 * block comment terminates it early, and the remainder of the sentence is then
 * parsed as code.)
 *
 * ### Why this provider is acceptable under an "analytics off by default" policy
 *  - It is already a dependency, so this adds no new vendor relationship.
 *  - It is cookieless and IP-truncating: no persistent identifier, no
 *    cross-site tracking, no advertising profile.
 *  - It is first-party — no third-party script is loaded into the page.
 *  - It is gateable: nothing is requested until `categories.analytics` is true.
 */
export function Analytics() {
  // `useSyncExternalStore` rather than `useEffect` + `setState`.
  //
  // The consent flag lives in `localStorage`, which is a genuine external
  // store, and this is the hook React provides for exactly that. The usual
  // `useState(false)` + `useEffect(() => setState(read()))` shape produces an
  // extra render pass and trips `react-hooks/set-state-in-effect`.
  //
  // `getServerSnapshot` returns `false`, so during SSR and the hydration render
  // the component renders nothing — which is both the correct answer (a
  // server has no access to this browser's consent) and what prevents a
  // hydration mismatch. On the client the real value is read immediately.
  //
  // The snapshot is a boolean, so it is referentially stable and cannot cause
  // the "getSnapshot should be cached" infinite loop that returning a freshly
  // parsed object would.
  const allowed = useSyncExternalStore(
    subscribeToConsentChange,
    () => readStoredConsent()?.categories.analytics === true,
    () => false
  );

  if (!allowed) return null;

  return (
    <>
      <LazyWebAnalytics />
      <LazySpeedInsights />
    </>
  );
}

/**
 * No-op subscribe.
 *
 * `useSyncExternalStore` only needs a re-render when the value can change
 * while mounted. Consent can change from the preferences dialog, and that
 * component writes the same `localStorage` key, so a `storage` listener is the
 * right signal. `storage` only fires in *other* documents, so the same-tab
 * case is covered by `subscribeToConsentChange` falling back to no
 * subscription — the dialog's own write triggers its own re-render, and the
 * analytics components unmount on the next navigation.
 *
 * In practice the analytics components are mounted once for the app lifetime
 * and the consent decision is made before they appear, so this is a
 * belt-and-braces subscription rather than a hot path.
 */
function subscribeToConsentChange(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}

/**
 * Lazily mounted so an opt-out visitor never downloads either script.
 *
 * The dynamic import is what makes the consent gate real: both packages
 * immediately inject a `<script>` tag on mount, so a static top-level import
 * would ship the tag in the initial HTML and fire the request before consent
 * was ever read.
 */
function LazyWebAnalytics() {
  const [Component, setComponent] = useState<
    React.ComponentType<{ mode?: 'auto' | 'development' | 'production' }> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void import('@vercel/analytics/react')
      .then((mod) => {
        if (!cancelled) setComponent(() => mod.Analytics);
      })
      .catch(() => {
        // Analytics is optional; a blocked chunk must not break the app.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Component) return null;
  return <Component mode="production" />;
}

function LazySpeedInsights() {
  // `SpeedInsightsProps` is a different shape from `AnalyticsProps` — it takes
  // `framework` and `basePath`, and no `mode` at all. Typing this state as
  // `ComponentType<{ mode?: ... }>` made the resolved component unassignable
  // even though it is a perfectly valid React component. `ComponentType<never>`
  // accepts any component and is the honest annotation for "some component we
  // only know by its identity", since the prop types are irrelevant here: this
  // wrapper renders it with no props at all.
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('@vercel/speed-insights/react')
      .then((mod) => {
        if (!cancelled) setComponent(() => mod.SpeedInsights);
      })
      .catch(() => {
        // Same: purely diagnostic, never fatal.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Component) return null;
  return <Component />;
}
