'use client';
import { useEffect, type RefObject } from 'react';

/**
 * Magnetic hover — the element translates toward the cursor within its bounds
 * and springs back on leave. Transform-only, rAF-throttled on the listener
 * thread (scrolling stays smooth), disabled under prefers-reduced-motion.
 *
 *   <button ref={ref} className="magnetic-hover">…</button>
 */
export function useMagneticHover<T extends HTMLElement>(ref: RefObject<T | null>, strength = 0.28) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = '';
    };

    el.addEventListener('mousemove', onMove, { passive: true });
    el.addEventListener('mouseleave', onLeave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [ref, strength]);
}