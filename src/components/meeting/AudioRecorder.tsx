"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Pause, Play, Square, Loader2, Monitor, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { formatDuration } from "@/lib/utils";
import type { RecordingState } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  meetingId: string;
  onTranscribed: (transcript: string, title: string) => void;
};

/** Systeem-audio = scherm/venster delen (desktop-apps, alles wat uit je speakers komt). Tab = alleen die ene browsertab. Mic = fysiek / headset. */
export type AudioCaptureMode = "system" | "tab" | "mic";

export default function AudioRecorder({ meetingId, onTranscribed }: Props) {
  const [captureMode, setCaptureMode] = useState<AudioCaptureMode>("system");
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

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

  const start = useCallback(async () => {
    setError(null);
    try {
      let stream: MediaStream;

      if (captureMode === "mic") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        // Tab-audio: kies "Chrome-tab" + vink "Geluid delen" aan.
        // Systeem-audio: kies "Scherm" of "Venster" + vink "Geluid delen" aan (waar ondersteund).
        let displayStream: MediaStream;
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video:
              captureMode === "tab"
                ? { displaySurface: "browser" }
                : { displaySurface: "monitor" },
            audio: true,
          });
        } catch {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
        }
        displayStreamRef.current = displayStream;

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          displayStreamRef.current = null;
          setError(
            captureMode === "tab"
              ? "Geen tab-audio: kies opnieuw een tabblad en vink 'Geluid delen' / 'Share audio' aan."
              : "Geen systeem-audio: kies scherm of venster en vink 'Geluid delen' aan (macOS/Chrome ondersteunt dit niet overal — probeer tab-audio als de call in de browser loopt)."
          );
          return;
        }

        stream = new MediaStream([...audioTracks]);
        // Video niet meteen stoppen: op sommige browsers blijft audio dan stabieler
        displayStream.getVideoTracks().forEach((t) => {
          t.onended = () => {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          };
        });
      }

      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000);
      setState("recording");

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

      startVolumeMonitor(stream);

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
  }, [meetingId, captureMode]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
      const pausedAt = Date.now() - duration * 1000;
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - pausedAt) / 1000));
      }, 1000);
      if (streamRef.current) startVolumeMonitor(streamRef.current);
    }
  }, [duration]);

  const stopAllStreams = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    displayStreamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    displayStreamRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    setState("processing");
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    await new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = () => resolve();
      mediaRecorderRef.current!.stop();
    });

    stopAllStreams();

    const mimeType = mediaRecorderRef.current.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });

    await fetch(`/api/meetings/${meetingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endedAt: new Date().toISOString(), duration }),
    });

    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    formData.append("mimeType", mimeType);

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(90, p + 5));
    }, 500);

    try {
      const res = await fetch(`/api/meetings/${meetingId}/transcribe`, {
        method: "POST",
        body: formData,
      });
      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) throw new Error("Transcriptie mislukt");
      const data = await res.json();
      setState("done");
      onTranscribed(data.transcript?.content || "", data.title || "");
    } catch (err: unknown) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : "Transcriptie mislukt");
      setState("idle");
    }
  }, [meetingId, duration, onTranscribed, stopAllStreams]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stopAllStreams();
    };
  }, [stopAllStreams]);

  const modeOptions: {
    value: AudioCaptureMode;
    title: string;
    hint: string;
    icon: typeof Monitor;
  }[] = [
    {
      value: "system",
      title: "Systeem-audio",
      hint:
        "Kies in het venster **Hele scherm** of **Venster** en zet **geluid delen** aan. Ideaal voor Zoom/Teams **desktop-app** of elk geluid dat op je computer afspeelt.",
      icon: Monitor,
    },
    {
      value: "tab",
      title: "Tab-audio",
      hint:
        "Kies **Chrome-tabblad** (of Edge-tab) en vink **Geluid delen** aan. Alleen die tab wordt opgenomen — het beste voor **Google Meet / Zoom in de browser** (minder ruis dan hele systeem).",
      icon: AppWindow,
    },
    {
      value: "mic",
      title: "Alleen microfoon",
      hint:
        "Geen scherm delen. Gebruik bij **fysieke meetings** of als je alleen je eigen stem wilt (headset).",
      icon: Mic,
    },
  ];

  if (state === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <div className="text-center">
          <p className="font-medium text-indigo-700">Transcriptie bezig…</p>
          <p className="text-sm text-indigo-500 mt-1">Dit kan even duren</p>
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
        <p className="text-sm text-green-600">Duur: {formatDuration(duration)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-gray-200 bg-white p-6 md:p-8">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {state === "idle" && (
        <div className="space-y-3">
          <Label className="text-base font-semibold text-gray-900">Audio bron</Label>
          <p className="text-xs text-gray-500">
            Standaard: systeem-audio. Kies tab-audio als je call in de browser draait — vaak schoner. Microfoon alleen voor live bijeenkomsten.
          </p>
          <div className="grid gap-3 sm:grid-cols-1">
            {modeOptions.map(({ value, title, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCaptureMode(value)}
                className={cn(
                  "flex w-full flex-col rounded-lg border-2 p-4 text-left transition-colors",
                  captureMode === value
                    ? "border-indigo-600 bg-indigo-50/80"
                    : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      captureMode === value ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-600"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-gray-900">{title}</span>
                  {value === "system" && (
                    <span className="ml-auto rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                      Standaard
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">{hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-6">
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

        <div className="flex flex-wrap items-center justify-center gap-3">
          {state === "idle" && (
            <Button onClick={start} size="lg" className="gap-2">
              <Mic className="h-4 w-4" />
              {captureMode === "mic" ? "Start opname (microfoon)" : "Start opname (deel scherm/tab)"}
            </Button>
          )}

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
                Resume
              </Button>
              <Button onClick={stop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop & transcriptie
              </Button>
            </>
          )}
        </div>

        {state !== "idle" && captureMode !== "mic" && (
          <p className="text-center text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 max-w-md">
            Laat het gedeelde tabblad of venster open tot je op Stop drukt — anders stopt de opname mee.
          </p>
        )}
      </div>
    </div>
  );
}
