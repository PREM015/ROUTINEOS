/**
 * PWA background-sync helpers.
 * Register/delegate Background Sync tags for queueing offline mutations.
 */

const isClient = typeof window !== 'undefined';

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isClient || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Whether the browser supports Background Sync.
 */
export function isBackgroundSyncSupported(): boolean {
  return (
    isClient &&
    'serviceWorker' in navigator &&
    'SyncManager' in window
  );
}

type SyncManagerShim = {
  register: (tag: string) => Promise<void>;
  getTags: () => Promise<string[]>;
  unregister: (tag: string) => Promise<void>;
};

function getSync(registration: ServiceWorkerRegistration): SyncManagerShim | undefined {
  return (registration as ServiceWorkerRegistration & { sync?: SyncManagerShim }).sync;
}

/**
 * Register a one-off background sync tag. Resolves `false` when unsupported.
 * @example
 * registerSync('sync-journal-entries')
 */
export async function registerSync(tag: string): Promise<boolean> {
  if (!isBackgroundSyncSupported()) return false;
  const registration = await getRegistration();
  const sync = registration ? getSync(registration) : undefined;
  if (!registration || !sync) return false;
  try {
    await sync.register(tag);
    return true;
  } catch {
    return false;
  }
}

/**
 * List currently pending sync tags.
 */
export async function getPendingTags(): Promise<string[]> {
  if (!isBackgroundSyncSupported()) return [];
  const registration = await getRegistration();
  const sync = registration ? getSync(registration) : undefined;
  if (!registration || !sync) return [];
  try {
    const tags = await sync.getTags();
    return [...tags];
  } catch {
    return [];
  }
}

/**
 * Check whether a specific sync tag is still queued.
 */
export async function hasPendingSync(tag: string): Promise<boolean> {
  const tags = await getPendingTags();
  return tags.includes(tag);
}

/**
 * Cancel a pending sync tag.
 */
export async function cancelSync(tag: string): Promise<boolean> {
  if (!isBackgroundSyncSupported()) return false;
  const registration = await getRegistration();
  const sync = registration ? getSync(registration) : undefined;
  if (!registration || !sync) return false;
  try {
    await sync.unregister(tag);
    return true;
  } catch {
    return false;
  }
}