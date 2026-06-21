const MAX_RETRIES = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function humanizeFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("unable to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return "Geen verbinding met de server. Controleer je internet en probeer opnieuw.";
  }
  return msg || "Transcriptie mislukt";
}

export type UploadSegmentParams = {
  meetingId: string;
  blob: Blob;
  index: number;
  total: number;
  offsetSeconds: number;
  totalDuration: number;
  mimeType: string;
  isLast: boolean;
};

/** Upload één audiosegment naar de server met exponential backoff retries. */
export async function uploadSegmentWithRetry(params: UploadSegmentParams): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const formData = new FormData();
      formData.append("audio", params.blob, `chunk-${params.index}.webm`);
      formData.append("index", String(params.index));
      formData.append("total", String(params.total));
      formData.append("offsetSeconds", String(params.offsetSeconds));
      formData.append("totalDuration", String(params.totalDuration));
      formData.append("mimeType", params.mimeType || "audio/webm");
      formData.append("isLast", params.isLast ? "true" : "false");

      const res = await fetch(`/api/meetings/${params.meetingId}/transcribe-chunk`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ||
            `Chunk ${params.index + 1}/${params.total} faalde (${res.status})`,
        );
      }
      return;
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      await sleep(Math.min(16_000, 1000 * 2 ** attempt));
    }
  }
}
