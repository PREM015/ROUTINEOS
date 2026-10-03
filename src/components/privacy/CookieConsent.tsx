'use client';

/**
 * Cookie consent banner.
 *
 * A **thin view over `src/store/consent.store.ts`**, deliberately holding no
 * state of its own.
 *
 * That is the whole design constraint. A first version of this file kept its own
 * `localStorage` copy under a *different* key (`routineos.consent`) while the
 * store used `routineos.cookie-consent` — so the banner would have written to
 * one key and `Analytics.tsx` would have read another, and a visitor who
 * accepted would still be treated as having declined. Two sources of truth for
 * consent is the exact bug class this project keeps hitting (two fallbacks in
 * `AppContext`, two write paths in the heatmap, two cookie-name derivations in
 * `proxy.ts`).
 *
 * So: the store owns the record, the version and the persistence; this file owns
 * only the presentation.
 *
 * Wrapped around the app in `src/app/layout.tsx`.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { useConsentStore } from '@/store/consent.store';

/**
 * The banner plus its provider shell.
 *
 * The store is a plain zustand store and needs no provider, so this is a
 * pass-through — but `layout.tsx` already wraps the app in it, and keeping the
 * wrapper means the consent UI can be swapped or extended without touching the
 * root layout's structure.
 */
export function CookieConsentProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * First-visit banner.
 *
 * `bannerOpen` is only ever true once the store has read `localStorage`, so
 * nothing renders during SSR and nobody who already decided sees a flash.
 *
 * Sits at `z-[60]`, above the sticky header (`z-30`) and the dashboard's mobile
 * quick-action FAB (`bottom-24`). A consent prompt that renders behind other UI
 * is a prompt nobody can answer.
 */
export function CookieConsentBanner() {
  const bannerOpen = useConsentStore((s) => s.bannerOpen);
  const acceptAll = useConsentStore((s) => s.acceptAll);
  const rejectNonEssential = useConsentStore((s) => s.rejectNonEssential);
  const reduce = useReducedMotion();

  if (!bannerOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
    >
      <div
        className={
          'mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-floating backdrop-blur-xl ' +
          'sm:flex-row sm:items-center sm:gap-4 ' +
          (reduce ? '' : 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2')
        }
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Cookies</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Essential cookies keep the app working. Optional ones help us
            understand usage, and nothing is shared with advertisers. You can
            change this later from the footer.{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy policy
            </Link>
            .
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {/*
            "Essential only" is a first-class answer, not a dismiss. Declining
            optional cookies is a legitimate choice and the copy says so plainly.
          */}
          <button
            type="button"
            onClick={rejectNonEssential}
            className="rounded-full border border-border px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.98] motion-reduce:transition-none"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Re-opens the preferences dialog from a footer link.
 *
 * `openPreferences` sets `preferencesOpen`, which the preferences dialog in the
 * store's own UI observes. Returns `null` when there is nothing to do so a
 * footer link can render it unconditionally.
 */
export function CookieConsentSettingsButton({ className }: { className?: string }) {
  const openPreferences = useConsentStore((s) => s.openPreferences);
  return (
    <button
      type="button"
      onClick={openPreferences}
      className={className}
      aria-label="Change cookie preferences"
    >
      Cookie preferences
    </button>
  );
}
