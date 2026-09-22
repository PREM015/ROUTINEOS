'use client';

import { useContext } from 'react';
import { AppContext } from './AppContext';

/**
 * Read AppContext state. Kept in its own module so Fast Refresh treats the
 * provider file as component-only. Must be used inside `<AppProvider>`.
 */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export default useApp;
