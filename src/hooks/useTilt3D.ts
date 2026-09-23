'use client';
import { useEffect, type RefObject } from 'react';

/**
 * 3D tilt — the element rotates toward the pointer (rotateX/rotateY, with a
 * perspective baked into the transform so no extra wrapper is required) and
 * relaxes back on leave. Transform/opacity only, disabled under
 * prefers-reduced-motion.
 *
 *   <div ref={ref} className="tilt-3d" style={{ transformStyle: 'preserve-3d' }}>…</div>
 */
export function useTilt3D<T extends HTMLElement>(ref: RefObject<T | null>, maxDeg = 7) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) - 0.5;
      const py = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) - 0.5;
      const rx = -py * maxDeg * 2;
      const ry = px * maxDeg * 2;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
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
  }, [ref, maxDeg]);
}