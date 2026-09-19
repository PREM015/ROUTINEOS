'use client';

import { useEffect, useState } from 'react';

/**
 * Media query hook: returns whether the given CSS media query currently
 * matches. Defaults to `false` on the server (and until the effect runs on
 * the client) to avoid hydration mismatches.
 */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}