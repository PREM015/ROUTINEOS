'use client';
import { useEffect, type RefObject } from 'react';

/**
 * Makes an element track the pointer and expose it as `--mouse-x` / `--mouse-y`
 * CSS custom properties (pixels relative to the element). Consumers apply the
 * `.spotlight-hover` or `.cursor-glow` classes from the effects library; the
 * vars default to centre so both themes still show a resting glow.
 *
 * Uses a single rAF-throttled listener, transform/opacity only, and is fully
 * disabled under prefers-reduced-motion.
 */
export function useSpotlight<T extends HTMLElement>(ref: RefObject<T | null>, size = 220) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    el.style.setProperty('--spotlight-size', `${size}px`);

    let raf = 0;
    const update = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mouse-x', `${clientX - rect.left}px`);
      el.style.setProperty('--mouse-y', `${clientY - rect.top}px`);
    };
    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => update(event.clientX, event.clientY));
    };
    const onEnter = (event: MouseEvent) => {
      update(event.clientX, event.clientY);
    };

    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseenter', onEnter, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseenter', onEnter);
    };
  }, [ref, size]);
}