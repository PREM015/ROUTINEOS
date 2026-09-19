'use client';

import { useShallow } from 'zustand/react/shallow';
import { useUserStore } from '@/store/user.store';
import type { UserProfile, SettingsPatch } from '@/store/user.store';
import type { UpdateProfileInput, UserStats } from '@/types/auth';

/**
 * User hook: subscribe to the user store for the profile, settings, stats,
 * onboarding flag and the profile/settings actions.
 */
export function useUser() {
  const profile = useUserStore((state) => state.profile);
  const settings = useUserStore((state) => state.settings);
  const stats = useUserStore((state) => state.stats);
  const isOnboarded = useUserStore((state) => state.isOnboarded);
  const loading = useUserStore((state) => state.loading);
  const error = useUserStore((state) => state.error);

  const actions = useUserStore(
    useShallow((state) => ({
      getProfile: state.getProfile,
      updateProfile: state.updateProfile,
      updateSettings: state.updateSettings,
      getUserStats: state.getUserStats,
      onboards: state.onboards,
      clear: state.clear,
      reset: state.reset,
    }))
  );

  return {
    profile,
    settings,
    stats,
    isOnboarded,
    loading,
    error,
    ...actions,
  };
}

export type { UserProfile, SettingsPatch, UpdateProfileInput, UserStats };
export { useUserStore };