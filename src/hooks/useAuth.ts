'use client';

import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/auth.store';
import type { AuthStatus, AuthUser, RegisterInput, UserPatch } from '@/store/auth.store';

/**
 * Auth hook: subscribe to the auth store for the current user, auth status
 * and the session-derived actions. Selectors are memoized with useShallow to
 * avoid needless re-renders when the underlying arrays/objects change.
 */
export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const sessionChecked = useAuthStore((state) => state.sessionChecked);
  const error = useAuthStore((state) => state.error);
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');
  const isLoading = useAuthStore((state) => state.status === 'loading' || state.status === 'idle');

  const actions = useAuthStore(
    useShallow((state) => ({
      init: state.init,
      login: state.login,
      register: state.register,
      logout: state.logout,
      updateUser: state.updateUser,
      setUser: state.setUser,
      reset: state.reset,
    }))
  );

  return {
    user,
    status,
    sessionChecked,
    error,
    isAuthenticated,
    isLoading,
    ...actions,
  };
}

export type { AuthStatus, AuthUser, RegisterInput, UserPatch };
export { useAuthStore };