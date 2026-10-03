'use client';

/**
 * A5: magnetic micro-tilt — "the one hero card per page, desktop only, max 4
 * degrees of rotation toward the cursor via perspective + rotateX/Y, heavily
 * damped (spring, not linear)".
 *
 * ## Why the values are written straight to the DOM
 *
 * The rotation is a pointermove handler running at input frequency. Routing it
 * through React state would re-render the whole hero card — including the
 * gradient area fill, the SVG trend path and the streak arc — on every single
 * mouse move. Instead the two angles are written to CSS custom properties and
 * `.magnetic-tilt` (globals.css) does the `perspective + rotateX + rotateY`.
 * The card is never re-rendered; only two custom properties on one element
 * change, and the property itself is composited on the GPU.
 *
 * ## Why it bails out early
 *
 * Coarse pointers have no cursor to tilt toward, and a phone should not pay for
 * a `will-change: transform` layer. Both the hook and the CSS guard on
 * `(pointer: coarse)`.
 */

import { useEffect, useRef } from 'react';

/** The brief's cap. Past ~4 degrees it reads as a toy rather than as glass. */
const MAX_TILT_DEG = 4;

export function useMagneticTilt<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    if (!window.matchMedia('(pointer: fine)').matches) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // -0.5..0.5 from the card's own centre, so the neutral position is
      // "cursor dead centre" rather than "cursor off to the left".
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;

      el.style.setProperty('--tilt-y', `${(nx * MAX_TILT_DEG).toFixed(2)}deg`);
      el.style.setProperty('--tilt-x', `${(-ny * MAX_TILT_DEG).toFixed(2)}deg`);
      // Feeds the A3 cursor-follow glow from the same handler, so the card does
      // not need two pointermove listeners.
      el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      el.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };

    const reset = () => {
      el.style.setProperty('--tilt-y', '0deg');
      el.style.setProperty('--tilt-x', '0deg');
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', reset);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', reset);
    };
  }, [enabled]);

  return ref;
}
