"use client";
import React, { useEffect, useId, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE } from '@/lib/motion';
import { BODY_CLASS, FOOTER_CLASS, GRAIN_CLASS, HEADER_CLASS, OVERLAY_CLASS, PANEL_CLASS } from './modal-frame';

const noopSubscribe = () => () => {};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /**
   * Pinned action row rendered outside the scrolling body, so Cancel/Save stay
   * reachable however long the form is. A submit button placed here must point
   * back at its form with `form="<form id>"`.
   */
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  // Portals need a document, which does not exist while server-rendering, so the
  // dialog waits for hydration rather than crashing the server render.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Page scroll lock, restoring whatever the page had before. The scrollbar is
  // padded back so locking does not shift the layout sideways.
  useEffect(() => {
    if (!isOpen) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  /**
   * Escape to close, focus containment, and focus restoration.
   *
   * The dialog previously had none of these despite declaring
   * `aria-modal="true"`. That combination is worse than no role at all: a
   * screen reader is told the rest of the page is inert, but keyboard focus
   * still walked straight into it, so a keyboard or screen-reader user could
   * tab into the page behind the scrim and operate controls that are visually
   * covered — and Escape, the universal "get me out of here", did nothing.
   */
  useEffect(() => {
    if (!isOpen) return;

    // Remember what had focus so it can be handed back on close; otherwise
    // focus falls to <body> and the user loses their place in the page.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    // Move focus into the dialog. Prefer the first control, else the panel
    // itself, which is focusable via `tabIndex={-1}`.
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const initial = focusables()[0] ?? panel;
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Trap Tab within the panel.
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  // The panel is portalled to <body> on purpose: `position: fixed` resolves
  // against the nearest ancestor with a transform/filter/backdrop-filter, and
  // .glass-panel has backdrop-filter, so a dialog rendered in place was centred
  // on that panel and scrolled with the page instead of the viewport.
  if (!hydrated) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className={OVERLAY_CLASS}
            onClick={onClose}
          >
            <div className={GRAIN_CLASS} aria-hidden="true" />
          </motion.div>
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: EASE }}
            className={PANEL_CLASS}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
          >
            <div className={HEADER_CLASS}>
              {title && <h2 id={titleId} className="text-xl font-bold text-foreground">{title}</h2>}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className={BODY_CLASS}>{children}</div>
            {footer && <div className={FOOTER_CLASS}>{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
