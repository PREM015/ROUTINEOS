'use client';
import { useEffect, useRef, type RefObject } from 'react';

/**
 * Scroll-driven parallax for background decoration (marketing pages only).
 * Translates the element vertically by `scrollY * speed`; `speed` = 0.1–0.25
 * reads best. rAF-throttled, transform-only, disabled under
 * prefers-reduced-motion. Returns the ref to attach to the element.
 */
export function useParallax<T extends HTMLElement>(speed = 0.14): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const update = () => {
      el.style.transform = `translate3d(0, ${(window.scrollY * speed).toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [speed]);

  return ref;
}