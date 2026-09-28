/**
 * Shared layout contract for viewport overlays (Modal, Dialog, Drawer).
 *
 * Every dialog used to hand-roll its own positioning, and they disagreed:
 * `Modal` had no height cap, `Dialog` had no scroll area, both used `w-full`
 * (edge-to-edge on phones) and sat at `z-40`/`z-50` — *below* the sticky navbar
 * and the mobile tab bar, so the scrim never covered the app chrome.
 *
 * The panel is a viewport-anchored flex column:
 *
 *   header   pinned, never scrolls
 *   body     the only scrolling region
 *   footer   pinned, so Save/Cancel are always reachable
 *
 * Height is capped rather than fixed, so a short dialog stays short. `100dvh`
 * tracks the *visible* viewport, which is what matters on mobile where the URL
 * bar collapses; `90vh` is the desktop fallback.
 */

/**
 * Frosted scrim, above app chrome (navbar `z-50`, mobile tab bar `z-50`).
 *
 * The film grain is a *child* ({@link GRAIN_CLASS}), not part of this class:
 * `.noise-overlay` sets `pointer-events: none`, so putting both on one element
 * made the scrim transparent to clicks and every click landed on the page
 * behind the dialog.
 */
export const OVERLAY_CLASS = 'fixed inset-0 z-[100] overlay-glass';

/** Film grain layer inside the scrim. Decorative and click-through. */
export const GRAIN_CLASS = 'noise-overlay';

/** Shared panel: viewport-centred, height-capped, safe margins on small screens. */
export const PANEL_CLASS =
  'fixed left-1/2 top-1/2 z-[110] flex w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 ' +
  'max-h-[calc(100dvh-2rem)] flex-col rounded-xl border border-border bg-card p-6 ' +
  'text-foreground shadow-long outline-none sm:max-h-[90vh]';

/** Title row. `shrink-0` keeps it visible while the body scrolls. */
export const HEADER_CLASS = 'mb-4 flex shrink-0 items-start justify-between gap-4';

/**
 * The only scrolling region. `min-h-0` lets it actually shrink inside the flex
 * column, and `overscroll-contain` stops scroll chaining from reaching the
 * page behind the dialog.
 */
export const BODY_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain';

/** Pinned action row. */
export const FOOTER_CLASS = 'mt-6 flex shrink-0 flex-wrap items-center justify-end gap-2';

/** Full-screen variant of {@link PANEL_CLASS} for content that owns the viewport. */
export const FULLSCREEN_PANEL_CLASS = 'fixed inset-0 z-[110] flex flex-col bg-card text-foreground';
