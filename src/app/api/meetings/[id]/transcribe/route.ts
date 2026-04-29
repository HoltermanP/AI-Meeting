import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio, generateTitle } from "@/lib/openai";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { del } from "@vercel/blob";

export const maxDuration = 300;

/** Whisper max: 25 MB. We houden 1 MB marge. */
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

/**
 * Comprimeert audio naar 16 kHz mono MP3 via ffmpeg.
 * Retourneert null als ffmpeg niet beschikbaar is.
 */
async function compressAudio(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-y", "-i", inputPath,
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "24k",
      outputPath,
    ]);
    ff.on("close", (code) => resolve(code === 0));
    ff.on("error", () => resolve(false));
  });
}

/**
 * Stuurt audio naar Whisper. Als het bestand te groot is, probeert het eerst
 * te comprimeren via ffmpeg. Geeft een duidelijke fout als dat ook niet lukt.
 */
async function transcribeBestEffort(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  if (buffer.length <= WHISPER_MAX_BYTES) {
    return transcribeAudio(buffer, mimeType);
  }

  // Bestand te groot → probeer te comprimeren via ffmpeg
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
  const inputPath = join(tmpdir(), `rec-in-${Date.now()}.${ext}`);
  const outputPath = join(tmpdir(), `rec-out-${Date.now()}.mp3`);

  try {
    await writeFile(inputPath, buffer);
    const ok = await compressAudio(inputPath, outputPath);

    if (ok) {
      const compressed = await readFile(outputPath);
      if (compressed.length <= WHISPER_MAX_BYTES) {
        return transcribeAudio(compressed, "audio/mp3");
      }
    }
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }

  throw new Error(
    `Audio-bestand is te groot voor Whisper (${Math.round(buffer.length / 1024 / 1024)} MB, max 24 MB). ` +
    `Installeer ffmpeg via 'brew install ffmpeg' voor automatische compressie.`
  );
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

    let buffer: Buffer;
    if (blobUrl) {
      // Audio staat in Vercel Blob — download het hier
      const audioRes = await fetch(blobUrl);
      if (!audioRes.ok) throw new Error("Blob download mislukt");
      buffer = Buffer.from(await audioRes.arrayBuffer());
    } else if (audioFile) {
      buffer = Buffer.from(await audioFile.arrayBuffer());
    } else {
      await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
      return NextResponse.json({ error: "Geen audio ontvangen" }, { status: 400 });
    }

    // Sla provisorisch op zodat de UI direct verder kan; Whisper draait op de achtergrond
    const transcriptRow = await prisma.transcript.upsert({
      where: { meetingId: id },
      update: { content: "", segments: JSON.stringify([]), isProvisional: true },
      create: { meetingId: id, content: "", segments: JSON.stringify([]), isProvisional: true },
    });

    await prisma.meeting.update({ where: { id }, data: { status: "completed" } });

    // Whisper verwerkt de volledige opname op de achtergrond — werkt ook voor 1+ uur meetings
    after(async () => {
      try {
        const { text, segments } = await transcribeBestEffort(buffer, mimeType);
        await prisma.transcript.update({
          where: { meetingId: id },
          data: { content: text, segments: JSON.stringify(segments), isProvisional: false },
        });
        const m = await prisma.meeting.findUnique({ where: { id } });
        if (m && text && (m.title === "Naamloze meeting" || m.title === "Untitled Meeting")) {
          await prisma.meeting.update({ where: { id }, data: { title: await generateTitle(text) } });
        }
      } catch (err) {
        console.error("Background Whisper error:", err);
        await prisma.transcript.updateMany({ where: { meetingId: id }, data: { isProvisional: false } });
      } finally {
        if (blobUrl) await del(blobUrl).catch(() => {});
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
