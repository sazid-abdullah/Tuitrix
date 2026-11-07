/**
 * IndexedDB storage for original question paper blobs (PDFs / high-res images).
 * Prevents bloating Firestore's 1MB document limit or localStorage quotas.
 * Automatically falls back to in-memory Map for unit tests / SSR / non-IDB environments.
 */

const DB_NAME = 'tuitrix_papers_v1';
const STORE_NAME = 'papers';
const memoryFallback = new Map<string, string>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function savePaperBlob(id: string, dataUrl: string): Promise<void> {
  if (!id) return;
  memoryFallback.set(id, dataUrl);
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dataUrl, id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Memory fallback already set above
  }
}

export async function getPaperBlob(id: string): Promise<string | null> {
  if (!id) return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || memoryFallback.get(id) || null);
      req.onerror = () => resolve(memoryFallback.get(id) || null);
    });
  } catch {
    return memoryFallback.get(id) || null;
  }
}

export async function deletePaperBlob(id: string): Promise<void> {
  if (!id) return;
  memoryFallback.delete(id);
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Memory fallback already deleted
  }
}
