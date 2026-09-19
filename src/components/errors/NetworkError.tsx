'use client';

import { ErrorState } from './ErrorState';
import { useEffect, useState } from 'react';

export function NetworkError() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <ErrorState
      title="No Internet Connection"
      message="Please check your network connection and try again."
      showRefresh={false}
      action={{
        label: 'Retry',
        onClick: () => window.location.reload(),
      }}
    />
  );
}