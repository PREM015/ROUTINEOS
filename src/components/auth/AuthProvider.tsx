'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useSettingsLoader } from '@/hooks/useSettings';
import { DeviceSessionTracker } from '@/components/auth/DeviceSessionTracker';
import { resetFocusSettings } from '@/hooks/useFocusSettings';
import { clearOutbox } from '@/lib/focus/outbox';

function AuthSync() {
  const { status } = useSession();

  // Keeps the settings store in step with the session: loaded on sign-in and
  // cleared on sign-out so the next account never inherits the previous
  // user's preferences.
  useSettingsLoader(status === 'authenticated');

  /*
   * Focus settings are a module-scoped singleton rather than a context, so they need
   * the same explicit sign-out reset the settings store already does. Without it the
   * next account to sign in on this browser would see the previous user's timebox for
   * as long as the fetch took to land - and, if that fetch failed, indefinitely.
   */
  useEffect(() => {
    if (status !== 'authenticated') {
      resetFocusSettings();
      /*
       * The outbox is cleared on sign-out too, and not only for tidiness. It holds
       * session ids, and replaying the previous account's queued `end` after the next
       * account signs in on this browser would write to the previous account's row.
       */
      void clearOutbox();
    }
  }, [status]);

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
