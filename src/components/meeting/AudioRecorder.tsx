"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Pause, Play, Square, Loader2, Monitor, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration } from "@/lib/utils";
import type { RecordingState } from "@/types";
import { cn } from "@/lib/utils";

type SpeechRecognitionResultList = {
  length: number;
  [i: number]: { 0: { transcript: string }; isFinal: boolean };
};

type SpeechResultEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type TranscribeResultMeta = {
  provisional?: boolean;
};

/** Fysiek = alleen microfoon. Hybride/online = microfoon + systeem-audio gemengd (verschil = gebruiksscenario in de UI). */
export type AudioCaptureMode = "physical" | "online" | "hybrid";

type Props = {
  meetingId: string;
  onTranscribed: (transcript: string, title: string, meta?: TranscribeResultMeta) => void;
};

const CHUNK_AFTER_SECONDS = 30 * 60;
const CHUNK_INTERVAL_MS = 1000;

/** Schermdeling met systeemaudio: `systemAudio: "include"` vraagt expliciet om systeemgeluid (Chrome zet "Systeemaudio ook delen" vaak standaard aan). */
function getDisplayMediaWithSystemAudio(
  primary: boolean
): Promise<MediaStream> {
  const base = {
    audio: { suppressLocalAudioPlayback: false },
    systemAudio: "include" as const,
  };
  if (primary) {
    return navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" } as MediaTrackConstraints,
      ...base,
    } as DisplayMediaStreamOptions);
  }
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    ...base,
  } as DisplayMediaStreamOptions);
}

export default function AudioRecorder({ meetingId, onTranscribed }: Props) {
  const [captureMode, setCaptureMode] = useState<AudioCaptureMode | null>(null);
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [liveSpeechText, setLiveSpeechText] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [liveSpeechUserStarted, setLiveSpeechUserStarted] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<"off" | "listening" | "error">("off");
  const [speechHint, setSpeechHint] = useState<string | null>(null);
  const [lastProvisional, setLastProvisional] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const liveSpeechFinalRef = useRef("");
  const recognitionRef = useRef<InstanceType<SpeechRecCtor> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  /** Gecombineerde stream naar MediaRecorder */
  const streamRef = useRef<MediaStream | null>(null);
  /** Display stream (online/hybrid) — video-tracks bewaken scherm-stoppen */
  const displayStreamRef = useRef<MediaStream | null>(null);
  /** Microfoon-stream (fysiek, of gemengd met display) */
  const micStreamRef = useRef<MediaStream | null>(null);
  /** AudioContext voor microfoon + systeem-audio mixen */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const splitChunkingStartedRef = useRef(false);
  const chunkRequestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamTranscriptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentChunksRef = useRef(0);
  /** Opgeslagen modus bij start (zodat stop weet welke API te gebruiken) */
  const activeModeRef = useRef<AudioCaptureMode | null>(null);

  const clearChunkRequestInterval = useCallback(() => {
    if (chunkRequestIntervalRef.current) {
      clearInterval(chunkRequestIntervalRef.current);
      chunkRequestIntervalRef.current = null;
    }
  }, []);

  const startChunkRequestInterval = useCallback(() => {
    clearChunkRequestInterval();
    chunkRequestIntervalRef.current = setInterval(() => {
      const r = mediaRecorderRef.current;
      if (r?.state === "recording") {
        try { r.requestData(); } catch { /* ignore */ }
      }
    }, CHUNK_INTERVAL_MS);
  }, [clearChunkRequestInterval]);

  const maybeStartLongRecordingChunking = useCallback(
    (recordedSeconds: number) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state !== "recording") return;
      if (splitChunkingStartedRef.current) {
        if (!chunkRequestIntervalRef.current) startChunkRequestInterval();
        return;
      }
      if (recordedSeconds < CHUNK_AFTER_SECONDS) return;
      splitChunkingStartedRef.current = true;
      try { rec.requestData(); } catch { /* ignore */ }
      startChunkRequestInterval();
    },
    [startChunkRequestInterval]
  );

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

  const pickMimeType = () =>
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "audio/webm";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    setSpeechAvailable(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const getSpeechCtor = useCallback((): SpeechRecCtor | null => {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
    setSpeechStatus("off");
  }, []);

  const startSpeechRecognition = useCallback((resetAccumulated: boolean) => {
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    if (resetAccumulated) {
      liveSpeechFinalRef.current = "";
      setLiveSpeechText("");
    }
    const rec = new Ctor();
    rec.lang = "nl-NL";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: SpeechResultEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) liveSpeechFinalRef.current += `${t} `;
        else interim += t;
      }
      setLiveSpeechText(liveSpeechFinalRef.current + interim);
    };
    rec.onerror = (ev: Event) => {
      const err = (ev as unknown as { error?: string }).error;
      if (err === "aborted" || err === "no-speech") return;
      setSpeechStatus("error");
      if (err === "not-allowed") setSpeechHint("Microfoon geblokkeerd — controleer site-toestemming in de browser.");
      else if (err === "audio-capture") setSpeechHint("Geen microfoon beschikbaar.");
      else if (err === "network") setSpeechHint("Netwerkfout bij spraakherkenning.");
      else setSpeechHint(`Spraakherkenning: ${err || "onbekende fout"}`);
    };
    rec.onstart = () => { setSpeechStatus("listening"); setSpeechHint(null); };
    rec.onend = () => {
      if (mediaRecorderRef.current?.state === "recording") {
        try { rec.start(); } catch { /* herstart na limiet */ }
      } else {
        setSpeechStatus("off");
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      setSpeechStatus("error");
      setSpeechHint("Spraakherkenning start niet — probeer opnieuw.");
      setLiveSpeechUserStarted(false);
    }
  }, [getSpeechCtor]);

  /** Handmatig starten van live spraak (online/hybrid) na scherm-dialog. */
  const handleStartLiveSpeech = useCallback(async () => {
    setSpeechHint(null);
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      setSpeechHint("Gebruik Chrome of Edge voor live ondertiteling.");
      return;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((t) => t.stop());
    } catch {
      setSpeechHint("Geen microfoontoestemming — live tekst heeft een microfoon.");
      return;
    }
    setLiveSpeechUserStarted(true);
    startSpeechRecognition(true);
  }, [getSpeechCtor, startSpeechRecognition]);

  const startStreamTranscription = useCallback(() => {
    if (streamTranscriptIntervalRef.current) return;
    streamTranscriptIntervalRef.current = setInterval(async () => {
      const rec = mediaRecorderRef.current;
      const chunks = chunksRef.current;
      if (rec?.state !== "recording" || chunks.length === 0) return;
      const newChunks = chunks.slice(sentChunksRef.current);
      if (newChunks.length === 0) return;
      try {
        const mimeType = rec.mimeType || "audio/webm";
        const blob = new Blob(newChunks, { type: mimeType });
        const formData = new FormData();
        formData.append("audio", blob);
        formData.append("mimeType", mimeType);
        formData.append("isLast", "false");
        await fetch(`/api/meetings/${meetingId}/transcribe-stream`, { method: "POST", body: formData });
        sentChunksRef.current = chunks.length;
      } catch {
        /* ignore */
      }
    }, 8000);
  }, [meetingId]);

  const stopStreamTranscription = useCallback(() => {
    if (streamTranscriptIntervalRef.current) {
      clearInterval(streamTranscriptIntervalRef.current);
      streamTranscriptIntervalRef.current = null;
    }
  }, []);

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

  const start = useCallback(async (mode: AudioCaptureMode) => {
    setError(null);
    setLiveSpeechUserStarted(false);
    setSpeechHint(null);
    setSpeechStatus("off");
    activeModeRef.current = mode;

    try {
      let recordStream: MediaStream;

      if (mode === "physical") {
        // Alleen microfoon (fysieke meeting)
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = micStream;
        recordStream = micStream;

      } else {
        // Online of hybride: microfoon + systeem-audio (scherm/tab delen met geluid) gemengd
        let displayStream: MediaStream;
        try {
          displayStream = await getDisplayMediaWithSystemAudio(true);
        } catch {
          displayStream = await getDisplayMediaWithSystemAudio(false);
        }
        displayStreamRef.current = displayStream;

        if (displayStream.getAudioTracks().length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          displayStreamRef.current = null;
          setError("Geen systeem-audio: kies scherm of venster en vink 'Geluid delen' aan.");
          return;
        }

        displayStream.getVideoTracks().forEach((t) => {
          t.onended = () => { if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop(); };
        });

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamRef.current = micStream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaStreamSource(displayStream).connect(dest);
        audioCtx.createMediaStreamSource(micStream).connect(dest);
        recordStream = dest.stream;
      }

      streamRef.current = recordStream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(recordStream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      splitChunkingStartedRef.current = false;
      clearChunkRequestInterval();
      sentChunksRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(CHUNK_INTERVAL_MS);
      setState("recording");

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        setDuration(secs);
        maybeStartLongRecordingChunking(secs);
      }, 1000);

      startVolumeMonitor(recordStream);

      // Online/hybride: stream-transcriptie starten
      if (mode !== "physical") {
        startStreamTranscription();
      }

      // Fysiek: spraakherkenning auto-starten
      if (mode === "physical") {
        startSpeechRecognition(true);
      }

      await fetch(`/api/meetings/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "recording", startedAt: new Date().toISOString() }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
        setError("Delen geannuleerd of geen toestemming.");
      } else {
        setError(msg || "Opname starten mislukt");
      }
    }
  }, [
    meetingId,
    clearChunkRequestInterval,
    maybeStartLongRecordingChunking,
    startStreamTranscription,
    startSpeechRecognition,
  ]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      clearChunkRequestInterval();
      stopStreamTranscription();
      stopSpeechRecognition();
      setState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [clearChunkRequestInterval, stopStreamTranscription, stopSpeechRecognition]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      // Fysiek: speech auto-hervatten
      if (activeModeRef.current === "physical") {
        startSpeechRecognition(false);
      }
      // Online/hybride: spraak alleen als gebruiker het eerder startte
      if (activeModeRef.current !== "physical" && liveSpeechUserStarted) {
        startSpeechRecognition(false);
      }
      // Online/hybride: stream-transcriptie hervatten
      if (activeModeRef.current !== "physical") {
        startStreamTranscription();
      }
      setState("recording");
      const pausedAt = Date.now() - duration * 1000;
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - pausedAt) / 1000);
        setDuration(secs);
        maybeStartLongRecordingChunking(secs);
      }, 1000);
      if (streamRef.current) startVolumeMonitor(streamRef.current);
    }
  }, [duration, startSpeechRecognition, liveSpeechUserStarted, maybeStartLongRecordingChunking, startStreamTranscription]);

  const stop = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    setState("processing");
    if (timerRef.current) clearInterval(timerRef.current);
    clearChunkRequestInterval();
    stopStreamTranscription();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    await new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = () => resolve();
      mediaRecorderRef.current!.stop();
    });

    stopSpeechRecognition();
    stopAllStreams();

    const mimeType = mediaRecorderRef.current.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const mode = activeModeRef.current;

    await fetch(`/api/meetings/${meetingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endedAt: new Date().toISOString(), duration }),
    });

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(90, p + 5));
    }, 500);

    try {
      let transcript = "";

      if (mode === "physical") {
        // Microfoon → Whisper via /transcribe
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        formData.append("mimeType", mimeType);
        const res = await fetch(`/api/meetings/${meetingId}/transcribe`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Transcriptie mislukt");
        const data = await res.json();
        transcript = data.transcript || "";
      } else {
        // Online/hybride → /transcribe-stream (laatste chunk)
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        formData.append("mimeType", mimeType);
        formData.append("isLast", "true");
        const res = await fetch(`/api/meetings/${meetingId}/transcribe-stream`, { method: "POST", body: formData });
        if (!res.ok) throw new Error("Transcriptie mislukt");
        const data = await res.json();
        transcript = data.transcript || "";
      }

      clearInterval(progressInterval);
      setProgress(100);
      setLastProvisional(false);
      setState("done");
      onTranscribed(transcript, "", { provisional: false });
    } catch (err: unknown) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Transcriptie mislukt");
      setState("idle");
    }
  }, [
    meetingId,
    duration,
    onTranscribed,
    stopAllStreams,
    stopSpeechRecognition,
    clearChunkRequestInterval,
    stopStreamTranscription,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearChunkRequestInterval();
      stopStreamTranscription();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopAllStreams();
    };
  }, [stopAllStreams, clearChunkRequestInterval, stopStreamTranscription]);

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <div className="text-center">
          <p className="font-medium text-indigo-700">Audio versturen…</p>
          <p className="text-sm text-indigo-500 mt-1">Transcriptie wordt verwerkt.</p>
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
        {lastProvisional && (
          <p className="text-xs text-center text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-md">
            Whisper verfijnt het transcript op de achtergrond. Je kunt al notulen genereren.
          </p>
        )}
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
            <p className="text-center text-sm font-medium text-gray-700">Hoe wil je opnemen?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(
                [
                  {
                    mode: "physical" as const,
                    label: "Fysieke meeting",
                    icon: <Mic className="h-5 w-5 shrink-0" />,
                    desc: "Alleen microfoon",
                    detail:
                      "Iedereen in dezelfde ruimte. Je neemt alleen op via de microfoon (geen scherm delen).",
                  },
                  {
                    mode: "hybrid" as const,
                    label: "Hybride meeting",
                    icon: <Users className="h-5 w-5 shrink-0" />,
                    desc: "Microfoon + systeemaudio",
                    detail:
                      "Deelnemers op afstand én in de ruimte: je microfoon plus het geluid van je laptop (bijv. Teams of Zoom op het scherm).",
                  },
                  {
                    mode: "online" as const,
                    label: "Online meeting",
                    icon: <Monitor className="h-5 w-5 shrink-0" />,
                    desc: "Jij + geluid van de call",
                    detail:
                      "Volledig online: je microfoon voor jezelf, plus systeemaudio voor de rest (deel het venster of tabblad met geluid).",
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

        {/* Waarschuwing scherm open houden (alleen online/hybride) */}
        {(state === "recording" || state === "paused") && activeModeRef.current !== "physical" && (
          <p className="text-center text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 max-w-md">
            Laat het gedeelde scherm of venster open tot je op Stop drukt — anders stopt de opname mee.
          </p>
        )}

        {/* Live spraak sectie */}
        {(state === "recording" || state === "paused") && (
          <div className="w-full max-w-xl space-y-2">
            <p className="text-xs font-medium text-gray-700">Live meeschrijven (browser)</p>

            {!speechAvailable && (
              <p className="text-[11px] text-gray-500">
                Live ondertiteling werkt in Chrome of Edge. In andere browsers alleen Whisper na afloop.
              </p>
            )}

            {/* Online/hybride: handmatige start-knop */}
            {speechAvailable && activeModeRef.current !== "physical" && !liveSpeechUserStarted && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 space-y-2">
                <p className="text-[11px] text-indigo-900 leading-relaxed">
                  Na het delen van je scherm moet je <strong>apart</strong> live spraak starten — Chrome vereist
                  een klik na de scherm-dialog.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={handleStartLiveSpeech}
                  disabled={state === "paused"}
                >
                  <Mic className="h-4 w-4" />
                  Start live meeschrijven (microfoon)
                </Button>
                {state === "paused" && (
                  <p className="text-[10px] text-muted-foreground">Hervat de opname om live spraak te starten.</p>
                )}
              </div>
            )}

            {speechHint && (
              <p className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">
                {speechHint}
              </p>
            )}

            {(liveSpeechUserStarted || activeModeRef.current === "physical") && (
              <div className="flex items-center gap-2 text-[11px] text-gray-600">
                <span
                  className={cn(
                    "inline-flex h-2 w-2 rounded-full",
                    speechStatus === "listening" ? "bg-green-500 animate-pulse" : "bg-gray-300"
                  )}
                />
                {speechStatus === "listening" ? "Luistert…" : speechStatus === "error" ? "Gestopt — zie melding hierboven" : "Start…"}
              </div>
            )}

            {(liveSpeechUserStarted || (activeModeRef.current === "physical" && liveSpeechText)) && (
              <ScrollArea className="h-36 rounded-lg border border-gray-200 bg-gray-50/80 p-3 text-sm text-gray-800">
                {liveSpeechText ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{liveSpeechText}</p>
                ) : (
                  <p className="text-gray-400 text-xs">Spreek — de tekst verschijnt hier…</p>
                )}
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
