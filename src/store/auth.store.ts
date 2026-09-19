/**
 * Auth zustand store.
 *
 * Owns the current user, the auth status machine and the session checks.
 * Authentication is handled by NextAuth (credentials provider); the store
 * wraps `signIn` for login, POSTs to `/api/auth/register` and
 * `/api/auth/logout`, and restores the session via `GET /api/auth/me`.
 */

'use client';

import { create } from 'zustand';
import { signIn } from 'next-auth/react';
import { apiRequest, ApiError } from '@/lib/api-client';

export type AuthStatus =
  | 'idle'
  | 'loading'
  | 'authenticated'
  | 'unauthenticated';

export interface AuthUser {
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
  settings: Record<string, unknown> | null;
  createdAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export type UserPatch = Partial<Omit<AuthUser, 'id' | 'email'>>;

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  sessionChecked: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser | null>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: UserPatch) => void;
  setUser: (user: AuthUser | null) => void;
  reset: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'idle',
  sessionChecked: false,
  error: null,

  /**
   * Restore the session by calling /api/auth/me. Failures (including a
   * missing session) simply mark the user as unauthenticated.
   */
  init: async () => {
    set({ status: 'loading', error: null });
    try {
      const user = await apiRequest<AuthUser>('/api/auth/me');
      set({ user, status: 'authenticated', sessionChecked: true });
    } catch {
      set({ user: null, status: 'unauthenticated', sessionChecked: true });
    }
  },

  /**
   * Sign in with the NextAuth credentials provider, then re-sync the full
   * user via init(). Returns the authenticated user, or null on failure.
   */
  login: async (email, password) => {
    set({ status: 'loading', error: null });
    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      const error = result && typeof result === 'object' && 'error' in result ? result.error : undefined;
      if (error) {
        throw new ApiError(error, 401);
      }
      await get().init();
      return get().user;
    } catch (err) {
      set({
        error: errorMessage(err, 'Login failed'),
        status: 'unauthenticated',
        sessionChecked: true,
      });
      throw err;
    }
  },

  /**
   * Register a new account. The route sends a verification email; the user
   * remains unauthenticated until they verify and log in.
   */
  register: async (input) => {
    set({ status: 'loading', error: null });
    try {
      await apiRequest<{ message?: string }>('/api/auth/register', {
        method: 'POST',
        body: input,
      });
      set({ status: 'unauthenticated', sessionChecked: true });
    } catch (err) {
      set({
        error: errorMessage(err, 'Registration failed'),
        status: 'unauthenticated',
      });
      throw err;
    }
  },

  /**
   * End the session via /api/auth/logout and clear local auth state. The
   * local state is always cleared, even if the network call fails.
   */
  logout: async () => {
    set({ status: 'loading', error: null });
    try {
      await apiRequest<{ loggedOut: boolean }>('/api/auth/logout', {
        method: 'POST',
      });
      set({ user: null, status: 'unauthenticated', sessionChecked: true });
    } catch (err) {
      set({
        user: null,
        status: 'unauthenticated',
        sessionChecked: true,
        error: errorMessage(err, 'Logout failed'),
      });
    }
  },

  /** Merge a partial patch into the current user (e.g. after a profile edit). */
  updateUser: (patch) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...patch } : state.user,
    }));
  },

  /** Replace the whole user object (and derive status from it). */
  setUser: (user) => {
    set({
      user,
      status: user ? 'authenticated' : 'unauthenticated',
      sessionChecked: true,
    });
  },

  reset: () => {
    set({ user: null, status: 'idle', sessionChecked: false, error: null });
  },
}));