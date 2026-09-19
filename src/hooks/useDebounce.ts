'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce hook: returns a copy of `value` that only updates once `delay` ms
 * have passed without a newer value arriving. The returned value trails the
 * input during rapid typing (search boxes, filter inputs).
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}