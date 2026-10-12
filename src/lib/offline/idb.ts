/**
 * Minimal IndexedDB wrapper — no third-party dependency.
 *
 * `package.json` ships no `idb`/`dexie`/`localforage`, and the previous offline
 * queue used `localStorage`, which a service worker cannot read at all. That is
 * why `sw.js`'s sync handler had nothing to flush.
 *
 * Deliberately tiny: just enough typed helpers for the stores the offline layer
 * needs. Not a general abstraction.
 *
 * ## Stores
 *
 *   `outbox`   user mutations captured while offline, replayed on reconnect.
 *   `schedule` notification mirror — the worker fires anything due from here.
 *   `cache`    per-user read cache (resolved day, settings) so the app can
 *              render and schedule while offline.
 *
 * ## Versioning
 *
 * `OFFLINE_DB_VERSION` **must be bumped in lockstep with `public/sw.js`**, which
 * opens the same database. If the page upgrades to `v2` while the worker still
 * opens `v1`, the worker's `indexedDB.open` rejects with a `VersionError` and the
 * offline schedule/outbox silently stop working. The upgrade handler is written
 * to be additive (it only creates a store when it is missing) so a client that
 * skips a version still ends up with every store.
 */

export const OFFLINE_DB_NAME = 'routineos-offline';
export const OFFLINE_DB_VERSION = 2;

export const STORE_OUTBOX = 'outbox';
export const STORE_SCHEDULE = 'schedule';
export const STORE_CACHE = 'cache';

/** Every store the schema owns, so the upgrade handler and tests stay in sync. */
export const OFFLINE_STORES = [STORE_OUTBOX, STORE_SCHEDULE, STORE_CACHE] as const;

function isSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isSupported()) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { keyPath: 'localId', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SCHEDULE)) {
        db.createObjectStore(STORE_SCHEDULE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    // A blocked upgrade (another tab holding an older version) should not wedge
    // the queue forever.
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  }).catch((error) => {
    // Allow a later call to retry rather than caching the rejection forever.
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = work(transaction.objectStore(storeName));
        transaction.oncomplete = () => resolve(request ? request.result : undefined);
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      })
  );
}

export function idbPut<T>(storeName: string, value: T): Promise<unknown> {
  return run(storeName, 'readwrite', (store) => store.put(value as unknown as IDBValidKey));
}

export function idbPutAll<T>(storeName: string, values: T[]): Promise<unknown> {
  if (!values.length) return Promise.resolve(0);
  return run(storeName, 'readwrite', (store) => {
    values.forEach((value) => store.put(value as unknown as IDBValidKey));
    return undefined;
  }).then(() => values.length);
}

export function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return run<T>(storeName, 'readonly', (store) => store.get(key) as IDBRequest<T>);
}

export function idbGetAll<T>(storeName: string): Promise<T[]> {
  return run<T[]>(storeName, 'readonly', (store) => store.getAll() as IDBRequest<T[]>).then(
    (result) => result ?? []
  );
}

export function idbDelete(storeName: string, key: IDBValidKey): Promise<unknown> {
  return run(storeName, 'readwrite', (store) => store.delete(key));
}

export function idbClear(storeName: string): Promise<unknown> {
  return run(storeName, 'readwrite', (store) => store.clear());
}
