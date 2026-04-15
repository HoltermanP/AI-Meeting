import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio, generateTitle } from "@/lib/openai";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";

export const maxDuration = 300;

/** Whisper limiet: 25 MB. Houd marge voor metadata. */
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;
const MIN_LIVE_CHARS = 40;

function quickTitleFromLive(live: string, current: string): string {
  if (current !== "Naamloze meeting" && current !== "Untitled Meeting") return current;
  const t = live.trim().replace(/\s+/g, " ").slice(0, 72);
  return t || current;
}

/**
 * Comprimeert audio naar 16 kHz mono MP3 via ffmpeg (indien beschikbaar).
 * Geeft null terug als ffmpeg niet beschikbaar is.
 */
async function compressWithFfmpeg(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-ar", "16000",   // 16 kHz — optimaal voor Whisper
      "-ac", "1",       // mono
      "-b:a", "24k",    // 24 kbps
      outputPath,
    ]);
    ff.on("close", (code) => resolve(code === 0));
    ff.on("error", () => resolve(false)); // ffmpeg niet beschikbaar
  });
}

/**
 * Splits een buffer op in gelijke stukken van maximaal maxBytes.
 * Elk stuk wordt apart getranscribeerd; resultaten worden samengevoegd.
 */
async function transcribeInChunks(
  buffer: Buffer,
  mimeType: string,
  chunkSize: number
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, offset + chunkSize));
  }

  let fullText = "";
  let allSegments: Array<{ start: number; end: number; text: string }> = [];
  let timeOffset = 0;

  for (const chunk of chunks) {
    const { text, segments } = await transcribeAudio(chunk, mimeType);
    fullText += (fullText ? " " : "") + text;
    const shifted = segments.map((s) => ({
      ...s,
      start: s.start + timeOffset,
      end: s.end + timeOffset,
    }));
    allSegments = allSegments.concat(shifted);
    // Schat de tijdsduur van dit stuk op basis van de laatste segment
    const lastSeg = segments[segments.length - 1];
    if (lastSeg) timeOffset += lastSeg.end;
  }

  return { text: fullText, segments: allSegments };
}

async function transcribeLargeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; segments: Array<{ start: number; end: number; text: string }> }> {
  if (buffer.length <= WHISPER_MAX_BYTES) {
    return transcribeAudio(buffer, mimeType);
  }

  // Probeer eerst te comprimeren via ffmpeg
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
  const inputPath = join(tmpdir(), `rec-in-${Date.now()}.${ext}`);
  const outputPath = join(tmpdir(), `rec-out-${Date.now()}.mp3`);

  try {
    await writeFile(inputPath, buffer);
    const compressed = await compressWithFfmpeg(inputPath, outputPath);

    if (compressed) {
      const compressedBuffer = await readFile(outputPath);
      if (compressedBuffer.length <= WHISPER_MAX_BYTES) {
        return transcribeAudio(compressedBuffer, "audio/mp3");
      }
      // Gecomprimeerd is nog steeds te groot → in stukken verwerken
      return transcribeInChunks(compressedBuffer, "audio/mp3", WHISPER_MAX_BYTES);
    }
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }

  // ffmpeg niet beschikbaar: stuur in stukken (elke stuk is een geldig deel)
  return transcribeInChunks(buffer, mimeType, WHISPER_MAX_BYTES);
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
    const liveTranscript = (formData.get("liveTranscript") as string | null)?.trim() || "";

    if (!audioFile) {
      await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());

    const useFastPath = liveTranscript.length >= MIN_LIVE_CHARS;

    if (useFastPath) {
      const titleNow = quickTitleFromLive(liveTranscript, meeting.title);

      const transcriptRow = await prisma.transcript.upsert({
        where: { meetingId: id },
        update: { content: liveTranscript, segments: JSON.stringify([]), isProvisional: true },
        create: { meetingId: id, content: liveTranscript, segments: JSON.stringify([]), isProvisional: true },
      });

      await prisma.meeting.update({ where: { id }, data: { status: "completed", title: titleNow } });

      after(async () => {
        try {
          const { text, segments } = await transcribeLargeAudio(buffer, mimeType);
          await prisma.transcript.update({
            where: { meetingId: id },
            data: { content: text, segments: JSON.stringify(segments), isProvisional: false },
          });
          const m = await prisma.meeting.findUnique({ where: { id } });
          if (m && text) {
            const shouldAutoTitle =
              m.title === "Naamloze meeting" ||
              m.title === "Untitled Meeting" ||
              m.title === titleNow;
            if (shouldAutoTitle) {
              await prisma.meeting.update({
                where: { id },
                data: { title: await generateTitle(text) },
              });
            }
          }
        } catch (err) {
          console.error("Background Whisper error:", err);
          await prisma.transcript.updateMany({
            where: { meetingId: id },
            data: { isProvisional: false },
          });
        }
      });

      return NextResponse.json({ transcript: transcriptRow, title: titleNow, provisional: true });
    }

    const { text, segments } = await transcribeLargeAudio(buffer, mimeType);

    let title = meeting.title;
    if ((title === "Naamloze meeting" || title === "Untitled Meeting") && text) {
      title = await generateTitle(text);
    }

    const transcript = await prisma.transcript.upsert({
      where: { meetingId: id },
      update: { content: text, segments: JSON.stringify(segments), isProvisional: false },
      create: { meetingId: id, content: text, segments: JSON.stringify(segments), isProvisional: false },
    });

    await prisma.meeting.update({ where: { id }, data: { status: "completed", title } });

    return NextResponse.json({ transcript, title, provisional: false });
  } catch (err) {
    await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Transcription error:", msg);

    // Duidelijke foutmelding op basis van oorzaak
    if (msg.includes("file is too large") || msg.includes("maximum file size")) {
      return NextResponse.json(
        { error: "Audio-bestand is te groot voor Whisper (max 25 MB). Installeer ffmpeg voor automatische compressie." },
        { status: 413 }
      );
    }
    if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
      return NextResponse.json(
        { error: "Transcriptie duurde te lang. Probeer het opnieuw." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: `Transcriptie mislukt: ${msg}` }, { status: 500 });
  }
}
