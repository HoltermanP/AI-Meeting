import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio, generateTitle } from "@/lib/openai";
import { writeFile, unlink, readFile, mkdtemp, readdir, rm, stat, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { del } from "@vercel/blob";
import ffmpegStatic from "ffmpeg-static";

export const maxDuration = 300;

/**
 * Pad naar de meegebundelde ffmpeg-binary (werkt zowel lokaal als op Vercel).
 * Fallback op systeem-ffmpeg als de package om wat voor reden niets oplevert.
 */
const FFMPEG_PATH: string = ffmpegStatic || "ffmpeg";

/**
 * Zorgt eenmalig dat het ffmpeg-pad beschikbaar én executable is.
 * Op Vercel verliest een meegebundelde binary soms zijn execute-bit.
 */
let ffmpegReadyPromise: Promise<string> | null = null;
async function ensureFfmpegReady(): Promise<string> {
  if (!ffmpegReadyPromise) {
    ffmpegReadyPromise = (async () => {
      console.log(`[transcribe] ffmpeg path = ${FFMPEG_PATH}`);
      try {
        const s = await stat(FFMPEG_PATH);
        console.log(`[transcribe] ffmpeg binary OK (size=${s.size} bytes, mode=${s.mode.toString(8)})`);
        await chmod(FFMPEG_PATH, 0o755).catch((e) =>
          console.warn(`[transcribe] chmod ffmpeg faalde (mogelijk read-only FS): ${e}`)
        );
      } catch (err) {
        console.error(`[transcribe] ffmpeg-binary niet vindbaar op ${FFMPEG_PATH}:`, err);
        throw new Error(`ffmpeg-binary niet beschikbaar op ${FFMPEG_PATH}`);
      }
      return FFMPEG_PATH;
    })();
  }
  return ffmpegReadyPromise;
}

/** Whisper max: 25 MB. We houden 1 MB marge. */
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

/** Chunk-lengte (sec) bij splitsen van te grote opnames; 10 min ≈ 1,8 MB MP3 mono 24 kbps. */
const CHUNK_DURATION_SECONDS = 10 * 60;

/** Maximaal aantal chunks dat tegelijk naar Whisper wordt gestuurd. */
const CHUNK_CONCURRENCY = 4;

/** Aantal retries per chunk bij Whisper-fouten (rate-limit / transient). */
const CHUNK_RETRIES = 2;

type WhisperResult = { text: string; segments: Array<{ start: number; end: number; text: string }> };

/**
 * Splits `inputPath` met ffmpeg in MP3-chunks van `chunkSeconds` (16 kHz mono 24 kbps).
 * Retourneert paden van de gegenereerde chunks (gesorteerd op volgorde).
 */
async function splitAudioIntoChunks(
  inputPath: string,
  outDir: string,
  chunkSeconds: number
): Promise<string[]> {
  const ffmpegPath = await ensureFfmpegReady();
  const start = Date.now();

  const { code, stderr } = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const ff = spawn(ffmpegPath, [
      "-y", "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "24k",
      "-f", "segment",
      "-segment_time", String(chunkSeconds),
      "-reset_timestamps", "1",
      join(outDir, "chunk-%03d.mp3"),
    ]);
    let err = "";
    ff.stderr?.on("data", (d) => {
      err += d.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    ff.on("close", (c) => resolve({ code: c, stderr: err }));
    ff.on("error", (e) => resolve({ code: -1, stderr: `spawn-error: ${e.message}\n${err}` }));
  });

  const elapsed = Date.now() - start;
  if (code !== 0) {
    console.error(`[transcribe] ffmpeg exit=${code} (${elapsed}ms). stderr-tail:\n${stderr}`);
    throw new Error(`ffmpeg-splitsing mislukt (exit ${code}): ${stderr.slice(-300)}`);
  }
  console.log(`[transcribe] ffmpeg klaar in ${elapsed}ms`);

  const files = (await readdir(outDir))
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".mp3"))
    .sort();
  if (files.length === 0) throw new Error("ffmpeg leverde geen chunks op");
  console.log(`[transcribe] ${files.length} chunks aangemaakt`);
  return files.map((f) => join(outDir, f));
}

/** Whisper-call met simpele retry voor transient fouten (rate limit / netwerk). */
async function transcribeWithRetry(buffer: Buffer, mimeType: string): Promise<WhisperResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
    try {
      return await transcribeAudio(buffer, mimeType);
    } catch (err) {
      lastErr = err;
      if (attempt < CHUNK_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Splits het bestand in chunks, transcribeert ze parallel (CHUNK_CONCURRENCY tegelijk),
 * en plakt teksten + segmenten weer in chronologische volgorde aan elkaar.
 * Tijdstempels van segmenten worden gecorrigeerd met de chunk-offset.
 */
async function transcribeChunked(inputPath: string, chunkSeconds: number): Promise<WhisperResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "whisper-chunks-"));
  try {
    const files = await splitAudioIntoChunks(inputPath, tmpDir, chunkSeconds);
    const results: WhisperResult[] = new Array(files.length);

    let cursor = 0;
    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= files.length) return;
        const buf = await readFile(files[i]);
        const r = await transcribeWithRetry(buf, "audio/mp3");
        const offset = i * chunkSeconds;
        results[i] = {
          text: r.text,
          segments: r.segments.map((s) => ({
            start: s.start + offset,
            end: s.end + offset,
            text: s.text,
          })),
        };
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CHUNK_CONCURRENCY, files.length) }, () => worker())
    );

    return {
      text: results.map((r) => r.text.trim()).filter(Boolean).join(" "),
      segments: results.flatMap((r) => r.segments),
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Stuurt audio naar Whisper. Bij te grote bestanden wordt automatisch gechunked
 * (en gecomprimeerd) via ffmpeg, zodat ook lange opnames binnen het Vercel-budget passen.
 */
async function transcribeBestEffort(buffer: Buffer, mimeType: string): Promise<WhisperResult> {
  if (buffer.length <= WHISPER_MAX_BYTES) {
    return transcribeAudio(buffer, mimeType);
  }

  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
  const inputPath = join(tmpdir(), `rec-in-${Date.now()}.${ext}`);

  try {
    await writeFile(inputPath, buffer);
    return await transcribeChunked(inputPath, CHUNK_DURATION_SECONDS);
  } catch (err) {
    const sizeMb = Math.round(buffer.length / 1024 / 1024);
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Audio-bestand (${sizeMb} MB) kon niet via chunked Whisper verwerkt worden: ${reason}.`
    );
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.meeting.update({ where: { id }, data: { status: "processing" } });

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const mimeType = (formData.get("mimeType") as string) || "audio/webm";
    const blobUrl = (formData.get("blobUrl") as string | null)?.trim() || "";

    // Voor directe upload (kleine bestanden, max ~4 MB via Vercel): buffer hier inlezen.
    // Voor Blob-uploads: URL doorgeven aan after() zodat de download daar plaatsvindt
    // en de server meteen kan antwoorden.
    let directBuffer: Buffer | null = null;
    if (!blobUrl) {
      if (!audioFile) {
        await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
        return NextResponse.json({ error: "Geen audio ontvangen" }, { status: 400 });
      }
      directBuffer = Buffer.from(await audioFile.arrayBuffer());
    }

    // Provisorisch opslaan zodat de UI direct verder kan; Whisper draait op de achtergrond
    const transcriptRow = await prisma.transcript.upsert({
      where: { meetingId: id },
      update: { content: "", segments: JSON.stringify([]), isProvisional: true },
      create: { meetingId: id, content: "", segments: JSON.stringify([]), isProvisional: true },
    });

    await prisma.meeting.update({ where: { id }, data: { status: "completed" } });

    // Sluit variabelen in zodat after() ze kan gebruiken
    const capturedBlobUrl = blobUrl;
    const capturedBuffer = directBuffer;
    const capturedMimeType = mimeType;

    // Whisper verwerkt de volledige opname op de achtergrond — werkt ook voor 1+ uur meetings
    after(async () => {
      const t0 = Date.now();
      console.log(`[transcribe ${id}] after() gestart, source=${capturedBlobUrl ? "blob" : "direct"}`);
      let buffer: Buffer;
      try {
        if (capturedBlobUrl) {
          const dlStart = Date.now();
          const audioRes = await fetch(capturedBlobUrl);
          if (!audioRes.ok) throw new Error(`Blob download mislukt (${audioRes.status})`);
          buffer = Buffer.from(await audioRes.arrayBuffer());
          console.log(
            `[transcribe ${id}] blob gedownload: ${Math.round(buffer.length / 1024 / 1024)} MB in ${Date.now() - dlStart}ms`
          );
        } else if (capturedBuffer) {
          buffer = capturedBuffer;
          console.log(`[transcribe ${id}] direct buffer: ${Math.round(buffer.length / 1024 / 1024)} MB`);
        } else {
          throw new Error("Geen audiodata beschikbaar");
        }

        const wStart = Date.now();
        const { text, segments } = await transcribeBestEffort(buffer, capturedMimeType);
        console.log(
          `[transcribe ${id}] Whisper klaar in ${Date.now() - wStart}ms — ${text.length} chars, ${segments.length} segments`
        );

        await prisma.transcript.update({
          where: { meetingId: id },
          data: { content: text, segments: JSON.stringify(segments), isProvisional: false },
        });
        const m = await prisma.meeting.findUnique({ where: { id } });
        if (m && text && (m.title === "Naamloze meeting" || m.title === "Untitled Meeting")) {
          await prisma.meeting.update({ where: { id }, data: { title: await generateTitle(text) } });
        }
        console.log(`[transcribe ${id}] OK — totaal ${Date.now() - t0}ms`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[transcribe ${id}] FAIL na ${Date.now() - t0}ms:`, msg);
        await prisma.transcript.updateMany({
          where: { meetingId: id },
          data: {
            content: `⚠️ Transcriptie mislukt: ${msg}`,
            isProvisional: false,
          },
        });
      } finally {
        if (capturedBlobUrl) await del(capturedBlobUrl).catch(() => {});
      }
    });

    return NextResponse.json({ transcript: transcriptRow, provisional: true });
  } catch (err) {
    await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Transcription error:", msg);
    return NextResponse.json({ error: msg || "Transcriptie mislukt" }, { status: 500 });
  }
}
