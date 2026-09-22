/**
 * User zustand store (session-based, not persisted).
 *
 * Owns the profile, user settings, aggregated stats and the onboarding
 * flag. Profile data is loaded from `GET /api/auth/me`, updates go to
 * `PATCH /api/auth/update-profile` and `PUT /api/settings`, and stats come
 * from `GET /api/users/[id]/profile`.
 */

import { create } from 'zustand';
import { apiRequest } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import type { UserSettings } from '@prisma/client';
import type { UpdateProfileInput, UserStats } from '@/types/auth';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string;
  preferredLanguage: string;
  role: string;
  onboardingCompletedAt: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
}

export type SettingsPatch = Partial<Record<keyof UserSettings, unknown>>;

interface ProfileEnvelope {
  profile: UserProfile;
  stats: UserStats;
}

interface UserState {
  profile: UserProfile | null;
  settings: UserSettings | null;
  stats: UserStats | null;
  isOnboarded: boolean;
  loading: boolean;
  error: string | null;
  getProfile: () => Promise<UserProfile | null>;
  updateProfile: (input: UpdateProfileInput) => Promise<UserProfile>;
  updateSettings: (input: SettingsPatch) => Promise<UserSettings>;
  getUserStats: () => Promise<UserStats>;
  onboards: (completed: boolean) => void;
  clear: () => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useUserStore = create<UserState>()((set, _get) => ({
  profile: null,
  settings: null,
  stats: null,
  isOnboarded: false,
  loading: false,
  error: null,

  /**
   * Load the full profile (with settings) for the authenticated user.
   * Falls back gracefully to `/api/auth/me`, which already includes a
   * `settings` relation when present.
   */
  getProfile: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<
        UserProfile & { settings?: UserSettings | null }
      >('/api/auth/me');

      const { settings, ...profile } = data;
      set({
        profile,
        settings: settings ?? null,
        isOnboarded: Boolean(profile.onboardingCompletedAt),
        loading: false,
      });
      return profile;
    } catch (err) {
      const message = errorMessage(err, 'Failed to load profile');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Update profile fields (name, displayName, bio, avatarUrl, timezone,
   * preferredLanguage) via `PATCH /api/auth/update-profile`.
   */
  updateProfile: async (input) => {
    set({ loading: true, error: null });
    try {
      const updated = await apiRequest<UserProfile>('/api/auth/update-profile', {
        method: 'PATCH',
        body: input,
      });
      set((state) => ({
        profile: state.profile ? { ...state.profile, ...updated } : updated,
        loading: false,
      }));
      return updated;
    } catch (err) {
      const message = errorMessage(err, 'Failed to update profile');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Update user settings via `PUT /api/settings`.
   */
  updateSettings: async (input) => {
    set({ loading: true, error: null });
    try {
      const settings = await apiRequest<UserSettings>('/api/settings', {
        method: 'PUT',
        body: input,
      });
      set({ settings, loading: false });
      return settings;
    } catch (err) {
      const message = errorMessage(err, 'Failed to update settings');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Fetch aggregated stats (and the public profile) for the authenticated
   * user from `GET /api/users/[id]/profile`.
   */
  getUserStats: async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      const err = new Error('Not authenticated');
      set({ error: err.message });
      throw err;
    }

    set({ loading: true, error: null });
    try {
      const data = await apiRequest<ProfileEnvelope>(
        `/api/users/${userId}/profile`
      );
      set({
        profile: data.profile,
        stats: data.stats,
        isOnboarded: Boolean(data.profile.onboardingCompletedAt),
        loading: false,
      });
      return data.stats;
    } catch (err) {
      const message = errorMessage(err, 'Failed to load user stats');
      set({ loading: false, error: message });
      throw err;
    }
  },

  /**
   * Mark onboarding as complete/incomplete. There is no dedicated server
   * route for this today, so it updates local state only (and mirrors the
   * flag onto the auth store's user).
   */
  onboards: (completed) => {
    const onboardingCompletedAt = completed ? new Date().toISOString() : null;
    set((state) => ({
      profile: state.profile
        ? { ...state.profile, onboardingCompletedAt }
        : state.profile,
      isOnboarded: completed,
    }));
    useAuthStore.getState().updateUser({ onboardingCompletedAt });
  },

  clear: () => {
    set({ profile: null, settings: null, stats: null, isOnboarded: false });
  },

  reset: () => {
    set({
      profile: null,
      settings: null,
      stats: null,
      isOnboarded: false,
      loading: false,
      error: null,
    });
  },
}));