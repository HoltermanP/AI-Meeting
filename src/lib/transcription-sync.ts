import {
  enqueueChunk,
  getPendingChunks,
  removeChunk,
  updateChunk,
  type QueuedChunk,
} from "./transcription-queue";

export type SyncProgress = {
  completed: number;
  total: number;
  meetingId: string;
};

export type SyncCallbacks = {
  onProgress?: (p: SyncProgress) => void;
  onChunkSynced?: (index: number, total: number) => void;
  onComplete?: () => void;
  onOffline?: (pending: number) => void;
};

const MAX_RETRIES = 8;
const activeSyncs = new Map<string, Promise<boolean>>();
const onlineResumeHandlers = new Set<(meetingId: string) => void>();

let onlineListenerRegistered = false;

export function humanizeFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("unable to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return "Geen verbinding met de server. Audio is lokaal opgeslagen en wordt automatisch geüpload zodra je weer online bent.";
  }
  if (lower.includes("abort")) {
    return "Upload afgebroken. Probeer opnieuw of wacht tot de verbinding hersteld is.";
  }
  return msg || "Transcriptie mislukt";
}

function isNetworkError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("unable to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadChunkToServer(chunk: QueuedChunk): Promise<void> {
  const formData = new FormData();
  formData.append("audio", chunk.audioBlob, `chunk-${chunk.index}.webm`);
  formData.append("index", String(chunk.index));
  formData.append("total", String(chunk.total));
  formData.append("offsetSeconds", String(chunk.offsetSeconds));
  formData.append("totalDuration", String(chunk.totalDuration));
  formData.append("mimeType", chunk.mimeType || "audio/webm");
  formData.append("isLast", chunk.isLast ? "true" : "false");

  const res = await fetch(`/api/meetings/${chunk.meetingId}/transcribe-chunk`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(
      (errData as { error?: string }).error ||
        `Chunk ${chunk.index + 1}/${chunk.total} faalde (${res.status})`,
    );
  }
}

async function uploadWithRetry(chunk: QueuedChunk): Promise<boolean> {
  await updateChunk(chunk.id, { status: "uploading" });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await updateChunk(chunk.id, { status: "pending", retries: attempt });
      return false;
    }

    try {
      await uploadChunkToServer(chunk);
      await removeChunk(chunk.id);
      return true;
    } catch (err) {
      const network = isNetworkError(err);
      if (network || attempt >= MAX_RETRIES) {
        await updateChunk(chunk.id, {
          status: "pending",
          retries: attempt + 1,
        });
        return false;
      }
      await sleep(Math.min(16_000, 1000 * 2 ** attempt));
    }
  }

  return false;
}

/**
 * Verwerk alle pending chunks voor een meeting (of globaal).
 * Retourneert true als alles gesynchroniseerd is.
 */
export async function syncMeetingChunks(
  meetingId: string,
  callbacks?: SyncCallbacks,
): Promise<boolean> {
  const existing = activeSyncs.get(meetingId);
  if (existing) return existing;

  const promise = (async () => {
    const pending = await getPendingChunks(meetingId);
    if (pending.length === 0) {
      callbacks?.onComplete?.();
      return true;
    }

    const total = Math.max(...pending.map((c) => c.total));
    let completed = pending.filter((c) => c.status === "synced").length;

    for (const chunk of pending) {
      const ok = await uploadWithRetry(chunk);
      if (ok) {
        completed += 1;
        callbacks?.onProgress?.({ completed, total, meetingId });
        callbacks?.onChunkSynced?.(chunk.index, chunk.total);
      } else {
        const stillPending = await getPendingChunks(meetingId);
        callbacks?.onOffline?.(stillPending.length);
        return false;
      }
    }

    callbacks?.onComplete?.();
    return true;
  })().finally(() => {
    activeSyncs.delete(meetingId);
  });

  activeSyncs.set(meetingId, promise);
  return promise;
}

export type EnqueueAndSyncParams = {
  meetingId: string;
  index: number;
  total: number;
  offsetSeconds: number;
  totalDuration: number;
  mimeType: string;
  audioBlob: Blob;
  isLast: boolean;
};

/** Sla lokaal op en probeer direct te uploaden (non-blocking bij falen). */
export async function enqueueAndTrySync(
  params: EnqueueAndSyncParams,
  callbacks?: SyncCallbacks,
): Promise<void> {
  await enqueueChunk({
    meetingId: params.meetingId,
    index: params.index,
    total: params.total,
    offsetSeconds: params.offsetSeconds,
    totalDuration: params.totalDuration,
    mimeType: params.mimeType,
    isLast: params.isLast,
    audioBlob: params.audioBlob,
  });

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    callbacks?.onOffline?.(await getPendingChunks(params.meetingId).then((p) => p.length));
    return;
  }

  void syncMeetingChunks(params.meetingId, callbacks);
}

/** Registreer listener die pending queues verwerkt zodra internet terug is. */
export function registerOnlineSyncListener(
  onResumed?: (meetingId: string) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (onResumed) onlineResumeHandlers.add(onResumed);

  if (!onlineListenerRegistered) {
    onlineListenerRegistered = true;
    window.addEventListener("online", async () => {
      const pending = await getPendingChunks();
      const meetingIds = [...new Set(pending.map((c) => c.meetingId))];
      for (const meetingId of meetingIds) {
        const done = await syncMeetingChunks(meetingId);
        if (done) {
          for (const handler of onlineResumeHandlers) {
            handler(meetingId);
          }
        }
      }
    });
  }

  return () => {
    if (onResumed) onlineResumeHandlers.delete(onResumed);
  };
}

export { getPendingChunks, countPendingChunks } from "./transcription-queue";
