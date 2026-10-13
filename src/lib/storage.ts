import type { VaultRecord } from './crypto';

// A single IndexedDB record holds the encrypted vault. IndexedDB survives reloads and offline use
// and, unlike localStorage, isn't read synchronously on every page load.

const DB_NAME = 'tick';
const STORE = 'vault';
const KEY = 'main';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadRecord(): Promise<VaultRecord | null> {
  return (await run<VaultRecord | undefined>('readonly', (s) => s.get(KEY))) ?? null;
}

export async function storeRecord(record: VaultRecord): Promise<void> {
  await run('readwrite', (s) => s.put(record, KEY));
}

export async function eraseRecord(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY));
}

/** Asks the browser not to evict the vault under storage pressure. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported or refused: the vault still works, it just isn't marked persistent.
  }
}
