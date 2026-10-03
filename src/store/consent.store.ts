/**
 * Cookie / tracking consent.
 *
 * The app already stored three consent-bearing things with no consent UI at
 * all: the `next-themes` localStorage key, the dashboard widget preferences
 * under `routineos.dashboard.widgets`, and the `deviceId` key that drives
 * `DeviceSession` rows. Analytics was not wired up at all, so there was
 * nothing to gate.
 *
 * This store is the gate. Rules it enforces:
 *
 *  - **Necessary** is always on and cannot be switched off. The auth session
 *    cookie is what it refers to; without it nothing works.
 *  - **Functional** (theme, dashboard layout, device id) is on by default.
 *    These are strictly local to the device and never transmitted, but they are
 *    still "storage" in the ePrivacy sense, so they are disclosed.
 *  - **Analytics** is OFF by default. Nothing is sent, and no analytics script
 *    is even downloaded, until the user opts in.
 *
 * Consent is per-device by nature (it is a browser-side flag with no server
 * record), which is stated plainly in the banner rather than glossed over.
 */

'use client';

import { create } from 'zustand';

export const CONSENT_STORAGE_KEY = 'routineos.cookie-consent';

/** Bump when the meaning of a category changes, so old consents re-prompt. */
export const CONSENT_VERSION = 1;

export interface ConsentCategories {
  /** Session cookie and CSRF-adjacent storage. Always true, not user-editable. */
  necessary: true;
  /** Theme, dashboard widget layout, device session id. Local only. */
  functional: boolean;
  /** Aggregate page views and interactions. Off unless explicitly accepted. */
  analytics: boolean;
}

export type ConsentRecord = {
  version: number;
  /** ISO timestamp of the decision. */
  decidedAt: string;
  categories: ConsentCategories;
};

/**
 * What is shown when nothing has been decided yet. Analytics is deliberately
 * off; a banner that presumes consent and requires a click to opt *out* is not
 * consent.
 */
export const DEFAULT_CONSENT: ConsentCategories = {
  necessary: true,
  functional: true,
  analytics: false,
};

const ALL_ON: ConsentCategories = {
  necessary: true,
  functional: true,
  analytics: true,
};

const NECESSARY_ONLY: ConsentCategories = {
  necessary: true,
  functional: false,
  analytics: false,
};

type ConsentState = {
  /** null until localStorage has been read; avoids a flash of the banner. */
  consent: ConsentRecord | null;
  /** True once localStorage has been consulted, so the UI can decide to show. */
  hydrated: boolean;
  /** Whether the preferences dialog is open. */
  preferencesOpen: boolean;
  /** Whether the first-visit banner is visible. */
  bannerOpen: boolean;
  setConsent: (categories: Partial<ConsentCategories>) => void;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  openPreferences: () => void;
  closePreferences: () => void;
};

function persist(categories: ConsentCategories) {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    categories,
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private-mode / storage-denied. Consent still applies for this page
    // view, it just will not be remembered. Failing closed here means we do
    // not persist an "accepted" flag we cannot honour.
  }
  return record;
}

export const useConsentStore = create<ConsentState>()((set, get) => ({
  consent: null,
  hydrated: false,
  preferencesOpen: false,
  bannerOpen: false,

  setConsent: (partial) => {
    const current = get().consent?.categories ?? DEFAULT_CONSENT;
    // `necessary` is not negotiable, whatever the caller passes.
    const next: ConsentCategories = {
      ...current,
      ...partial,
      necessary: true,
    };
    set({ consent: persist(next), bannerOpen: false, preferencesOpen: false });
  },

  acceptAll: () => {
    set({ consent: persist(ALL_ON), bannerOpen: false, preferencesOpen: false });
  },

  rejectNonEssential: () => {
    set({ consent: persist(NECESSARY_ONLY), bannerOpen: false, preferencesOpen: false });
  },

  openPreferences: () => set({ preferencesOpen: true, bannerOpen: false }),
  closePreferences: () => set({ preferencesOpen: false }),
}));

/**
 * Read a persisted decision. Returns null when there is nothing valid to read,
 * which is the signal to show the banner.
 *
 * Exported as a plain function (not a hook) so the caller can run it from a
 * `useEffect` on mount without subscribing to store updates.
 */
export function readStoredConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;

    const candidate = parsed as Partial<ConsentRecord>;
    if (candidate.version !== CONSENT_VERSION) return null;
    if (typeof candidate.decidedAt !== 'string') return null;

    const categories = candidate.categories;
    if (typeof categories !== 'object' || categories === null) return null;

    return {
      version: CONSENT_VERSION,
      decidedAt: candidate.decidedAt,
      categories: {
        // Re-assert rather than trust: a hand-edited localStorage entry must
        // never be able to turn necessary off.
        necessary: true,
        functional: categories.functional === true,
        analytics: categories.analytics === true,
      },
    };
  } catch {
    return null;
  }
}

/** True when analytics may be collected and its script loaded. */
export function hasAnalyticsConsent(): boolean {
  const record = readStoredConsent();
  return record?.categories.analytics === true;
}
