"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  countPendingChunks,
  registerOnlineSyncListener,
  syncMeetingChunks,
} from "@/lib/transcription-sync";

type Props = {
  meetingId: string;
  onSynced?: () => void;
};

/** Toont banner als er lokale audiosegmenten wachten op upload/sync. */
export default function PendingTranscriptionBanner({ meetingId, onSynced }: Props) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const n = await countPendingChunks(meetingId);
    setPending(n);
    return n;
  }, [meetingId]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const unregister = registerOnlineSyncListener((id) => {
      if (id === meetingId) {
        void refreshCount().then((n) => {
          if (n === 0) onSynced?.();
        });
      }
    });
    return unregister;
  }, [meetingId, onSynced, refreshCount]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const ok = await syncMeetingChunks(meetingId, {
        onOffline: (n) => setPending(n),
      });
      await refreshCount();
      if (ok) onSynced?.();
    } finally {
      setSyncing(false);
    }
  };

  if (pending === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <p className="text-sm font-medium text-amber-900">
            {pending === 1
              ? "1 audiosegment wacht op upload"
              : `${pending} audiosegmenten wachten op upload`}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            De opname staat lokaal opgeslagen in je browser. Zodra je weer online bent, wordt
            automatisch gesynchroniseerd.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-2 border-amber-300 bg-white hover:bg-amber-100"
        onClick={handleSync}
        disabled={syncing || (typeof navigator !== "undefined" && !navigator.onLine)}
      >
        {syncing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Nu synchroniseren
      </Button>
    </div>
  );
}
