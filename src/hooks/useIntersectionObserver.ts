'use client';

import { useEffect, useRef, useState } from 'react';

export interface UseIntersectionObserverOptions {
  root?: Element | null;
  rootMargin?: string;
  threshold?: number | number[];
  enabled?: boolean;
}

/**
 * IntersectionObserver hook: observes `ref.current` and returns an
 * `isIntersecting` flag. Handles the observer being unavailable (older
 * browsers / jsdom) by treating everything as visible, and ignores
 * elements that have already been unmounted.
 */
export function useIntersectionObserver<T extends Element>(
  options: UseIntersectionObserverOptions = {}
): [React.RefObject<T | null>, boolean] {
  const {
    root = null,
    rootMargin = '0px',
    threshold = 0,
    enabled = true,
  } = options;

  const ref = useRef<T | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') {
      setIsIntersecting(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsIntersecting(entry.isIntersecting);
      },
      { root, rootMargin, threshold }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, root, rootMargin, threshold]);

  return [ref, isIntersecting];
}