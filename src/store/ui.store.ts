/**
 * UI zustand store (session-scoped, not persisted).
 *
 * Owns ephemeral UI state that isn't worth persisting across reloads:
 * sidebar/mobile navigation, a toast queue and the open modal stack.
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface UiToast {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration: number;
}

export interface UiModal {
  id: string;
  type: string;
  props?: Record<string, unknown>;
}

interface UiState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  toasts: UiToast[];
  modals: UiModal[];
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  openModal: (id: string, type: string, props?: Record<string, unknown>) => void;
  closeModal: (id: string) => void;
  closeAllModals: () => void;
  pushToast: (toast: Omit<UiToast, 'id' | 'duration'> & { duration?: number }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  reset: () => void;
}

let toastSequence = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  sidebarOpen: false,
  mobileMenuOpen: false,
  toasts: [],
  modals: [],

  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),

  openModal: (id, type, props) => {
    const exists = get().modals.some((modal) => modal.id === id);
    if (exists) return;
    set((state) => ({ modals: [...state.modals, { id, type, props }] }));
  },

  closeModal: (id) => {
    set((state) => ({
      modals: state.modals.filter((modal) => modal.id !== id),
    }));
  },

  closeAllModals: () => set({ modals: [] }),

  /**
   * Add a toast to the queue and return its generated id. The toast is auto
   * dismissed after `duration` ms (default 4000). No DOM work happens here;
   * the toast UI subscribes to the store and renders the queue.
   */
  pushToast: (input) => {
    toastSequence += 1;
    const id = `toast-${Date.now()}-${toastSequence}`;
    const toast: UiToast = {
      id,
      type: input.type,
      message: input.message,
      description: input.description,
      duration: input.duration ?? 4000,
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));

    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        get().dismissToast(id);
      }, toast.duration);
    }

    return id;
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearToasts: () => set({ toasts: [] }),

  reset: () => {
    set({
      sidebarOpen: false,
      mobileMenuOpen: false,
      toasts: [],
      modals: [],
    });
  },
}));