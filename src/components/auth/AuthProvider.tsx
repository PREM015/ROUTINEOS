'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';

function AuthSync() {
  const { status } = useSession();
  
  useEffect(() => {
    if (status === 'authenticated') {
      void useAuthStore.getState().init();
    } else if (status === 'unauthenticated') {
      useAuthStore.setState({ status: 'unauthenticated', sessionChecked: true, user: null });
    }
  }, [status]);
  
  return null;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <AuthSync />
      {children}
    </SessionProvider>
  );
}
