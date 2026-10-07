'use client';

import { useEffect, useState } from 'react';

/**
 * Online status hook: tracks `navigator.onLine` through the browser's
 * `online`/`offline` events. Defaults to `true` on the server.
 */
export function useOnlineStatus(): boolean {
  // `?? true`: Node 21+ defines a partial global `navigator` during SSR with
  // no `onLine` property, so checking `typeof navigator === 'undefined'`
  // alone returned `undefined`, which rendered <OfflineNotice /> in the
  // server HTML and then failed hydration once the browser reported online.
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine ?? true
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}