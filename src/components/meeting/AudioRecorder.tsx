"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Pause, Play, Square, Loader2, Monitor, Users, RefreshCw, ChevronDown, Smartphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "@/lib/utils";
import type { RecordingState } from "@/types";
import { cn } from "@/lib/utils";

export type TranscribeResultMeta = {
  provisional?: boolean;
};

/** Fysiek = alleen microfoon. Hybride/online = microfoon + systeem-audio gemengd. */
export type AudioCaptureMode = "physical" | "online" | "hybrid";

type Props = {
  meetingId: string;
  onTranscribed: (transcript: string, title: string, meta?: TranscribeResultMeta) => void;
};

/** Hoe lang elke MediaRecorder-segment maximaal opneemt voordat-ie wordt geroteerd.
 *  7 min × 32 kbps ≈ 1,7 MB — past binnen Vercel's 4,5 MB body-limit én Whisper's 25 MB.
 */
const SEGMENT_DURATION_SECONDS = 7 * 60;
const CHUNK_INTERVAL_MS = 1000;

/**
 * Vraagt schermdeling met systeemaudio. Één aanroep — geen retry die de
 * "user gesture handler"-fout zou veroorzaken.
 */
function getDisplayMediaWithSystemAudio(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { suppressLocalAudioPlayback: false },
    systemAudio: "include",
  } as DisplayMediaStreamOptions);
}

/** Heuristiek: herkent labels van iPhones, Continuity-microfoons en typische telefoon-Bluetooth-namen. */
function isPhoneMic(label: string): boolean {
  const l = label.toLowerCase();
  return (
    l.includes("iphone") ||
    l.includes("ipad") ||
    l.includes("continuity") ||
    /\bandroid\b/.test(l) ||
    /\bgalaxy\b/.test(l) ||
    /\bpixel\b/.test(l)
  );
}


export default function AudioRecorder({ meetingId, onTranscribed }: Props) {
  const [captureMode, setCaptureMode] = useState<AudioCaptureMode | null>(null);
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  /** Bij fysieke meeting: gebruiker moet expliciet aangeven of een telefoon als microfoon gekoppeld wordt. */
  const [usePhoneMic, setUsePhoneMic] = useState<"unset" | "yes" | "no">("unset");
  /** Onthoudt of de selectie automatisch op een telefoon-mic is gezet, zodat we niet over een handmatige keuze heen schrijven. */
  const autoSelectedPhoneRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeModeRef = useRef<AudioCaptureMode | null>(null);

  /** Elk afgesloten audio-segment (complete WebM, ~7 min) klaar voor upload. */
  const recordedSegmentsRef = useRef<Array<{ blob: Blob; offsetSeconds: number }>>([]);
  /** Tijdstip (sec t.o.v. start) waarop het huidige segment is begonnen. */
  const currentSegmentStartRef = useRef(0);
  /** Timer die elke SEGMENT_DURATION_SECONDS de recorder roteert. */
  const rotateTimerRef = useRef<NodeJS.Timeout | null>(null);
  /** True zolang we actief opnemen — rotatie mag alleen schedulen als dit true is. */
  const isRecordingRef = useRef(false);

  const clearRotateTimer = useCallback(() => {
    if (rotateTimerRef.current) {
      clearTimeout(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }
  }, []);

  const pickMimeTypeRef = useRef<() => string>(() => "audio/webm");

  const startVolumeMonitor = (stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setVolume(Math.min(100, avg * 2));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  };

  const pickMimeType = useCallback(() =>
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "audio/webm",
  []);
  pickMimeTypeRef.current = pickMimeType;

  /**
   * Stopt de huidige MediaRecorder en wacht tot alle data is afgegeven.
   * Retourneert een complete WebM-blob (kan apart worden ge-transcribeerd).
   */
  const finalizeCurrentRecorder = useCallback(async (): Promise<Blob | null> => {
    const rec = mediaRecorderRef.current;
    if (!rec || (rec.state !== "recording" && rec.state !== "paused")) return null;

    const collected = chunksRef.current;
    chunksRef.current = [];

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });

    if (collected.length === 0) return null;
    return new Blob(collected, { type: rec.mimeType || "audio/webm" });
  }, []);

  /**
   * Start een nieuwe MediaRecorder op de bestaande recordStream.
   * Wordt gebruikt zowel bij eerste start als na elke rotate.
   */
  const startNewRecorder = useCallback((stream: MediaStream) => {
    const mimeType = pickMimeTypeRef.current();
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 32_000, // 32 kbps mono — genoeg voor spraak
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(CHUNK_INTERVAL_MS);
    mediaRecorderRef.current = recorder;
  }, []);

  const loadMics = useCallback(async () => {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach((t) => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      setAvailableMics(mics);
      if (!selectedMicId && mics.length > 0) {
        setSelectedMicId(mics[0].deviceId);
      }
    } catch {
      /* geen toestemming — stil falen */
    }
  }, [selectedMicId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadMics();
    navigator.mediaDevices.addEventListener("devicechange", loadMics);
    return () => navigator.mediaDevices.removeEventListener("devicechange", loadMics);
  }, [loadMics]);

  /** Telefoon uit de huidige lijst (eerste match). */
  const detectedPhoneMic = availableMics.find((m) => isPhoneMic(m.label || ""));

  /**
   * Voorselecteer telefoon-microfoon zodra die beschikbaar is en gebruiker "Ja" koos.
   * Schrijft niet over een latere handmatige keuze heen.
   */
  useEffect(() => {
    if (usePhoneMic !== "yes") return;
    if (!detectedPhoneMic) return;
    if (selectedMicId === detectedPhoneMic.deviceId) return;
    if (autoSelectedPhoneRef.current) return;
    setSelectedMicId(detectedPhoneMic.deviceId);
    autoSelectedPhoneRef.current = true;
  }, [usePhoneMic, detectedPhoneMic, selectedMicId]);

  /** Reset de "auto-geselecteerde" vlag als de gebruiker handmatig een andere mic kiest. */
  useEffect(() => {
    if (!detectedPhoneMic) return;
    if (selectedMicId !== detectedPhoneMic.deviceId) {
      autoSelectedPhoneRef.current = false;
    }
  }, [selectedMicId, detectedPhoneMic]);

  /** Bij "Ja" actief blijven scannen tot iPhone gevonden — devicechange-event vuurt niet altijd voor Continuity. */
  useEffect(() => {
    if (usePhoneMic !== "yes" || detectedPhoneMic) return;
    const t = setInterval(() => loadMics(), 2000);
    return () => clearInterval(t);
  }, [usePhoneMic, detectedPhoneMic, loadMics]);

  /** Reset telefoon-keuze als de gebruiker overschakelt naar online/hybride. */
  useEffect(() => {
    if (captureMode !== "physical") {
      setUsePhoneMic("unset");
      autoSelectedPhoneRef.current = false;
    }
  }, [captureMode]);

  const stopAllStreams = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    displayStreamRef.current = null;
    micStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const micAudioConstraints = useCallback((): MediaTrackConstraints => ({
    ...(selectedMicId ? { deviceId: { exact: selectedMicId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }), [selectedMicId]);

  /**
   * Roteert de MediaRecorder: stopt 'm, slaat het complete segment op, en start een
   * nieuwe recorder op dezelfde stream zodat de opname soepel doorgaat.
   * Wordt aangeroepen door een timer (elke SEGMENT_DURATION_SECONDS).
   */
  /** Tijdstip (epoch ms) waarop opname is gestart — referentie voor duration. */
  const startTimeRef = useRef(0);

  const rotateRecorder = useCallback(async (currentDurationSec: number) => {
    if (!isRecordingRef.current) return;
    const stream = streamRef.current;
    if (!stream) return;

    const blob = await finalizeCurrentRecorder();
    if (blob && blob.size > 0) {
      recordedSegmentsRef.current.push({
        blob,
        offsetSeconds: currentSegmentStartRef.current,
      });
    }
    if (!isRecordingRef.current) return;

    currentSegmentStartRef.current = currentDurationSec;
    startNewRecorder(stream);

    rotateTimerRef.current = setTimeout(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      void rotateRecorder(sec);
    }, SEGMENT_DURATION_SECONDS * 1000);
  }, [finalizeCurrentRecorder, startNewRecorder]);

  const scheduleNextRotate = useCallback(() => {
    clearRotateTimer();
    rotateTimerRef.current = setTimeout(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      void rotateRecorder(sec);
    }, SEGMENT_DURATION_SECONDS * 1000);
  }, [clearRotateTimer, rotateRecorder]);

  const start = useCallback(async (mode: AudioCaptureMode) => {
    setError(null);
    activeModeRef.current = mode;
    recordedSegmentsRef.current = [];
    currentSegmentStartRef.current = 0;

    try {
      let recordStream: MediaStream;

      if (mode === "physical") {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: micAudioConstraints(),
          video: false,
        });
        micStreamRef.current = micStream;
        recordStream = micStream;
      } else {
        // Één aanroep — geen retry, want een tweede getDisplayMedia buiten het
        // click-event gooit "must be called from a user gesture handler".
        const displayStream = await getDisplayMediaWithSystemAudio();
        displayStreamRef.current = displayStream;

        if (displayStream.getAudioTracks().length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          displayStreamRef.current = null;
          setError("Geen systeem-audio ontvangen. Kies een scherm of venster en vink 'Geluid delen' aan.");
          return;
        }

        displayStream.getVideoTracks().forEach((t) => {
          t.onended = () => {
            if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
          };
        });

        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: micAudioConstraints(),
          video: false,
        });
        micStreamRef.current = micStream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaStreamSource(displayStream).connect(dest);
        audioCtx.createMediaStreamSource(micStream).connect(dest);
        recordStream = dest.stream;
      }

      streamRef.current = recordStream;
      startNewRecorder(recordStream);
      isRecordingRef.current = true;
      setState("recording");

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(secs);
      }, 1000);

      scheduleNextRotate();
      startVolumeMonitor(recordStream);

      await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "recording", startedAt: new Date().toISOString() }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
        setError("Toestemming geweigerd — controleer microfoon- en schermrechten in je browser.");
      } else if (msg.includes("AbortError") || msg.includes("cancelled") || msg.includes("dismissed")) {
        setError("Schermdeling geannuleerd. Klik op Start om het opnieuw te proberen.");
      } else {
        setError(msg || "Opname starten mislukt");
      }
    }
  }, [meetingId, micAudioConstraints, scheduleNextRotate, startNewRecorder]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      isRecordingRef.current = false;
      clearRotateTimer();
      setState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [clearRotateTimer]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      isRecordingRef.current = true;
      setState("recording");
      startTimeRef.current = Date.now() - duration * 1000;
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(secs);
      }, 1000);
      scheduleNextRotate();
      if (streamRef.current) startVolumeMonitor(streamRef.current);
    }
  }, [duration, scheduleNextRotate]);

  /**
   * Upload één segment naar /transcribe-chunk. Gooit een fout bij niet-200.
   */
  const uploadSegment = useCallback(
    async (
      blob: Blob,
      index: number,
      total: number,
      offsetSeconds: number,
      totalDuration: number,
    ): Promise<void> => {
      const formData = new FormData();
      formData.append("audio", blob, `chunk-${index}.webm`);
      formData.append("index", String(index));
      formData.append("total", String(total));
      formData.append("offsetSeconds", String(offsetSeconds));
      formData.append("totalDuration", String(totalDuration));
      formData.append("mimeType", blob.type || "audio/webm");

      const res = await fetch(`/api/meetings/${meetingId}/transcribe-chunk`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { error?: string }).error ||
            `Chunk ${index + 1}/${total} faalde (${res.status})`,
        );
      }
    },
    [meetingId],
  );

  const stop = useCallback(async () => {
    if (!mediaRecorderRef.current && recordedSegmentsRef.current.length === 0) return;

    setState("processing");
    setProgress(0);
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    clearRotateTimer();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const finalDuration = duration;

    const lastBlob = await finalizeCurrentRecorder();
    if (lastBlob && lastBlob.size > 0) {
      recordedSegmentsRef.current.push({
        blob: lastBlob,
        offsetSeconds: currentSegmentStartRef.current,
      });
    }

    stopAllStreams();

    const segments = recordedSegmentsRef.current;
    const total = segments.length;

    await fetch(`/api/meetings/${meetingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endedAt: new Date().toISOString(), duration: finalDuration }),
    }).catch(() => {});

    if (total === 0) {
      setError("Geen audio opgenomen.");
      setState("idle");
      return;
    }

    try {
      // Trigger meteen een eerste refresh zodat de UI uit "Voorlopig"-modus gaat
      // en de polling-loop in de meetingpagina elke 4s verse transcript-data toont.
      onTranscribed("", "", { provisional: true });

      for (let i = 0; i < total; i++) {
        const seg = segments[i];
        await uploadSegment(seg.blob, i, total, seg.offsetSeconds, finalDuration);
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      setProgress(100);
      setState("done");
      onTranscribed("", "", { provisional: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transcriptie mislukt";
      setError(msg);
      setState("idle");
    }
  }, [
    meetingId,
    duration,
    onTranscribed,
    stopAllStreams,
    clearRotateTimer,
    finalizeCurrentRecorder,
    uploadSegment,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearRotateTimer();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopAllStreams();
    };
  }, [stopAllStreams, clearRotateTimer]);

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <div className="text-center">
          <p className="font-medium text-indigo-700">Audio transcriberen…</p>
          <p className="text-sm text-indigo-500 mt-1">
            {recordedSegmentsRef.current.length > 1
              ? `Whisper verwerkt ${recordedSegmentsRef.current.length} segmenten één voor één.`
              : "Whisper verwerkt de opname."}
          </p>
        </div>
        <Progress value={progress} className="w-full max-w-xs" />
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-green-100 bg-green-50 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <Mic className="h-6 w-6 text-green-600" />
        </div>
        <p className="font-medium text-green-700">Transcriptie klaar</p>
        <p className="text-xs text-center text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 max-w-md">
          Het volledige transcript is opgeslagen — je kunt nu notulen genereren.
        </p>
        <p className="text-sm text-green-600">Duur: {formatDuration(duration)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-6 md:p-8">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">{error}</div>
      )}

      <div className="flex flex-col items-center gap-6">
        {/* Pulserende indicator */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          {state === "recording" && (
            <>
              <div
                className="absolute inset-0 rounded-full bg-red-100 animate-ping"
                style={{ animationDuration: "1.5s", opacity: volume / 200 }}
              />
              <div
                className="absolute rounded-full bg-red-200"
                style={{
                  width: `${40 + volume * 0.4}px`,
                  height: `${40 + volume * 0.4}px`,
                  transition: "width 0.1s, height 0.1s",
                }}
              />
            </>
          )}
          <div
            className={cn(
              "relative flex h-16 w-16 items-center justify-center rounded-full transition-colors",
              state === "recording" ? "bg-red-500" : state === "paused" ? "bg-yellow-500" : "bg-gray-100"
            )}
          >
            {state === "idle" ? (
              <Mic className="h-7 w-7 text-gray-400" />
            ) : state === "recording" ? (
              <Mic className="h-7 w-7 text-white" />
            ) : (
              <MicOff className="h-7 w-7 text-white" />
            )}
          </div>
        </div>

        {state !== "idle" && (
          <div className="font-mono text-2xl font-bold text-gray-800">{formatDuration(duration)}</div>
        )}

        {/* Modus-keuze (alleen in idle) */}
        {state === "idle" && (
          <div className="w-full max-w-lg space-y-3">
            {/* Microfoon-selector */}
            {availableMics.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 shrink-0">Microfoon</label>
                <div className="relative flex-1">
                  <select
                    value={selectedMicId}
                    onChange={(e) => setSelectedMicId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  >
                    {availableMics.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label || `Microfoon ${mic.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                </div>
                <button
                  type="button"
                  onClick={loadMics}
                  title="Ververs apparaten"
                  className="shrink-0 rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <p className="text-center text-sm font-medium text-gray-700">Hoe wil je opnemen?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    mode: "physical" as const,
                    label: "Fysieke meeting",
                    icon: <Mic className="h-5 w-5 shrink-0" />,
                    desc: "Alleen microfoon",
                    detail: "Iedereen in dezelfde ruimte. Je neemt op via de microfoon.",
                  },
                  {
                    mode: "hybrid" as const,
                    label: "Hybride meeting",
                    icon: <Users className="h-5 w-5 shrink-0" />,
                    desc: "Microfoon + systeemaudio",
                    detail: "Deelnemers op afstand én in de ruimte: microfoon plus laptop-geluid (Teams/Zoom).",
                  },
                  {
                    mode: "online" as const,
                    label: "Online meeting",
                    icon: <Monitor className="h-5 w-5 shrink-0" />,
                    desc: "Jij + geluid van de call",
                    detail: "Volledig online: microfoon voor jezelf, systeemaudio voor de rest. Vereist schermdeling met 'Geluid delen'.",
                  },
                ] as const
              ).map(({ mode, label, icon, desc, detail }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCaptureMode(mode)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-3 text-left transition-colors sm:text-center",
                    captureMode === mode
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/50"
                  )}
                >
                  <span className="flex items-center gap-2 sm:flex-col sm:gap-1.5">
                    {icon}
                    <span className="text-xs font-semibold leading-tight">{label}</span>
                  </span>
                  <span className="text-[11px] text-gray-500 leading-snug">{desc}</span>
                  {captureMode === mode && (
                    <span className="w-full rounded-lg bg-white/80 px-2 py-2 text-left text-[11px] leading-relaxed text-gray-600 sm:text-center">
                      {detail}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* iPhone-koppeling — alleen bij fysieke meeting */}
            {captureMode === "physical" && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-800">
                      Telefoon als microfoon koppelen?
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Een iPhone (of Android) midden op tafel pakt vaak meer stemmen op dan de laptop-microfoon.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setUsePhoneMic("yes")}
                    className={cn(
                      "rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors",
                      usePhoneMic === "yes"
                        ? "border-indigo-500 bg-white text-indigo-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
                    )}
                  >
                    Ja, telefoon gebruiken
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsePhoneMic("no");
                      autoSelectedPhoneRef.current = false;
                      const firstNonPhone = availableMics.find((m) => !isPhoneMic(m.label || ""));
                      if (firstNonPhone) setSelectedMicId(firstNonPhone.deviceId);
                    }}
                    className={cn(
                      "rounded-lg border-2 px-3 py-2 text-xs font-medium transition-colors",
                      usePhoneMic === "no"
                        ? "border-indigo-500 bg-white text-indigo-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-indigo-300"
                    )}
                  >
                    Nee, laptop-microfoon
                  </button>
                </div>

                {usePhoneMic === "yes" && (
                  <div className="rounded-lg bg-white border border-indigo-100 px-3 py-2 text-[11px] leading-relaxed text-gray-700 space-y-1.5">
                    {detectedPhoneMic ? (
                      <p className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        Telefoon gevonden: {detectedPhoneMic.label || "iPhone-microfoon"} — automatisch geselecteerd.
                      </p>
                    ) : (
                      <>
                        <p className="flex items-center gap-1.5 text-amber-700 font-medium">
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          Wacht op telefoon…
                        </p>
                        <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                          <li>
                            <strong>iPhone (Continuity):</strong> ontgrendel je iPhone in de buurt van je Mac (zelfde Apple-account, Wi-Fi + Bluetooth aan).
                          </li>
                          <li>
                            <strong>Via kabel:</strong> sluit je telefoon met USB aan en sta microfoon-toegang toe.
                          </li>
                          <li>
                            <strong>Bluetooth-headset/telefoon:</strong> koppel als audio-apparaat in macOS-instellingen.
                          </li>
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {usePhoneMic === "unset" && (
                  <p className="text-[11px] text-amber-700">
                    Maak een keuze zodat je weet welke microfoon de opname maakt.
                  </p>
                )}
              </div>
            )}

            <Button
              onClick={() => captureMode && start(captureMode)}
              disabled={!captureMode}
              size="lg"
              className="w-full gap-2"
            >
              <Mic className="h-4 w-4" />
              Start opname
            </Button>
          </div>
        )}

        {/* Waarschuwing schermdeling open houden (alleen online/hybride) */}
        {(state === "recording" || state === "paused") && activeModeRef.current !== "physical" && (
          <p className="text-center text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 max-w-md">
            Laat het gedeelde scherm of venster open tot je op Stop drukt — anders stopt de opname mee.
          </p>
        )}

        {/* Bedieningsknoppen tijdens opname */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {state === "recording" && (
            <>
              <Button onClick={pause} variant="outline" size="icon">
                <Pause className="h-4 w-4" />
              </Button>
              <Button onClick={stop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop & transcriptie
              </Button>
            </>
          )}
          {state === "paused" && (
            <>
              <Button onClick={resume} variant="outline" className="gap-2">
                <Play className="h-4 w-4" />
                Hervat
              </Button>
              <Button onClick={stop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop & transcriptie
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
