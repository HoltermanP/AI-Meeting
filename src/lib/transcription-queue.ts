/** Lokale IndexedDB-wachtrij voor audiosegmenten die nog naar de server moeten. */

export type QueuedChunk = {
  id: string;
  meetingId: string;
  index: number;
  total: number;
  offsetSeconds: number;
  totalDuration: number;
  mimeType: string;
  isLast: boolean;
  status: "pending" | "uploading" | "synced";
  retries: number;
  createdAt: number;
  audioBlob: Blob;
};

const DB_NAME = "ai-meetings-transcription";
const STORE = "chunks";
const DB_VERSION = 1;

function chunkId(meetingId: string, index: number): string {
  return `${meetingId}:${index}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("meetingId", "meetingId", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = fn(store);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        request.onsuccess = () => resolve(request.result as T);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB tx failed"));
      }),
  );
}

export async function enqueueChunk(
  item: Omit<QueuedChunk, "id" | "status" | "retries" | "createdAt">,
): Promise<QueuedChunk> {
  const entry: QueuedChunk = {
    ...item,
    id: chunkId(item.meetingId, item.index),
    status: "pending",
    retries: 0,
    createdAt: Date.now(),
  };
  await tx("readwrite", (store) => store.put(entry));
  return entry;
}

export async function updateChunk(
  id: string,
  patch: Partial<Pick<QueuedChunk, "status" | "retries" | "total" | "isLast" | "totalDuration">>,
): Promise<void> {
  const existing = await tx<QueuedChunk | undefined>("readonly", (store) => store.get(id));
  if (!existing) return;
  await tx("readwrite", (store) => store.put({ ...existing, ...patch }));
}

export async function removeChunk(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

export async function getPendingChunks(meetingId?: string): Promise<QueuedChunk[]> {
  return openDb().then(
    (db) =>
      new Promise<QueuedChunk[]>((resolve, reject) => {
        const transaction = db.transaction(STORE, "readonly");
        const store = transaction.objectStore(STORE);
        const request = meetingId
          ? store.index("meetingId").getAll(meetingId)
          : store.getAll();
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
        request.onsuccess = () => {
          const all = (request.result as QueuedChunk[]) ?? [];
          resolve(
            all
              .filter((c) => c.status !== "synced")
              .sort((a, b) => a.index - b.index),
          );
        };
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function countPendingChunks(meetingId: string): Promise<number> {
  const pending = await getPendingChunks(meetingId);
  return pending.length;
}

export async function clearSyncedForMeeting(meetingId: string): Promise<void> {
  const all = await getPendingChunks(meetingId);
  const synced = all.filter((c) => c.status === "synced");
  await Promise.all(synced.map((c) => removeChunk(c.id)));
}
