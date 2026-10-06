'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useReviewScreens, type ReviewScreen } from '@/lib/analytics/review';
import type { AnalyticsDashboard } from '@/types/analytics';
import { cn } from '@/lib/utils';

/**
 * The guided overlay.
 *
 * Focus is **trapped** while open and **restored** on close. Both halves matter and the
 * second is the one usually missed: an overlay that captures focus and never gives it
 * back leaves a keyboard user's cursor at the top of the document with no indication of
 * where they are, which is disorienting in a way that is easy to ship and hard to notice
 * if you only test with a mouse.
 *
 * Every screen's content comes from `useReviewScreens`, which returns `null` when there is
 * not enough data — in which case this renders nothing at all and the trigger is hidden by
 * its parent. An overlay that opens onto "not enough data" is worse than no overlay.
 */
export function ReviewMode({
  payload,
  open,
  onClose,
}: {
  payload: AnalyticsDashboard;
  open: boolean;
  onClose: () => void;
}) {
  const screens = useReviewScreens(payload);
  const [index, setIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Capture whatever had focus before the overlay opened, so it can be handed back.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    return () => triggerRef.current?.focus();
  }, [open]);

  // Focus the panel on open, and on every step change.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (!screens) return;
        event.preventDefault();
        setIndex((current) => {
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const next = current + delta;
          if (next < 0) return screens.length - 1;
          if (next >= screens.length) return 0;
          return next;
        });
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      /*
        Trap. Without this, Tab walks straight out of the overlay into the page behind
        it, which is still visible and still focusable — so focus lands somewhere the
        user cannot see and the overlay appears to have vanished.
      */
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, screens]);

  // A shorter payload (a different period) must not leave the index past the end.
  useEffect(() => {
    if (!screens || index >= screens.length) return;
    // Clamping during render would be a side effect in the render phase; an effect is the
    // honest place for it, and it only fires when the screen list actually shrank.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex(0);
  }, [index, screens]);

  if (!open || !screens || screens.length === 0) return null;

  const screen = screens[Math.min(index, screens.length - 1)] as ReviewScreen;
  const Icon = screen.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-soft focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 id="review-title" className="text-lg font-semibold text-foreground">
              {screen.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{screen.body}</p>

        {screen.href && (
          <Link
            href={screen.href}
            className="mt-4 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {screen.hrefLabel ?? 'Open'}
          </Link>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setIndex((current) => (current - 1 + screens.length) % screens.length)
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </button>

          {/* Progress dots, buttons so they are reachable rather than decorative. */}
          <ol className="flex items-center gap-1.5">
            {screens.map((entry, dotIndex) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setIndex(dotIndex)}
                  aria-current={dotIndex === index ? 'step' : undefined}
                  aria-label={`Step ${dotIndex + 1}: ${entry.title}`}
                  className={cn(
                    'h-2 w-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    dotIndex === index ? 'bg-primary' : 'bg-muted-foreground/40 hover:bg-muted-foreground/70'
                  )}
                />
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => setIndex((current) => (current + 1) % screens.length)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Arrow keys to move, Escape to close.
        </p>
      </div>
    </div>
  );
}
