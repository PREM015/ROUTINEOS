'use client';

/**
 * Mobile menu zustand store — the open state of the phone navigation drawer.
 *
 * Two triggers live in different component trees (the hamburger in `Header`
 * and the "More" item in `MobileNav`) but must drive a single drawer, and the
 * layout that could have held that state is a server component. A tiny
 * module-level store keeps them in sync without prop-drilling through the
 * layout, the same way the other UI-ish stores in this folder do.
 */

import { create } from 'zustand';

interface MobileMenuState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useMobileMenuStore = create<MobileMenuState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
