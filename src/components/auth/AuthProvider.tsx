'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsLoader } from '@/hooks/useSettings';
import { DeviceSessionTracker } from '@/components/auth/DeviceSessionTracker';

function AuthSync() {
  const { status } = useSession();

  // Keeps the settings store in step with the session: loaded on sign-in and
  // cleared on sign-out so the next account never inherits the previous
  // user's preferences.
  useSettingsLoader(status === 'authenticated');

  useEffect(() => {
    if (status === 'authenticated') {
      void useAuthStore.getState().init();
    } else if (status === 'unauthenticated') {
      useAuthStore.setState({ status: 'unauthenticated', sessionChecked: true, user: null });
    }
  }, [status]);
  
  return null;
}

/**
 * `DeviceSessionTracker` must live inside `SessionProvider` so it can read the
 * session before registering this browser's device row.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <AuthSync />
      <DeviceSessionTracker />
      {children}
    </SessionProvider>
  );
}
