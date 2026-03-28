import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio, generateTitle } from "@/lib/openai";

/** Whisper kan lang duren; serverless timeout ruimer (Vercel Pro / zelf gehost). */
export const maxDuration = 300;

const MIN_LIVE_CHARS = 40;

function quickTitleFromLive(live: string, current: string): string {
  if (current !== "Naamloze meeting" && current !== "Untitled Meeting") return current;
  const t = live.trim().replace(/\s+/g, " ").slice(0, 72);
  return t || current;
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
        update: {
          content: liveTranscript,
          segments: JSON.stringify([]),
          isProvisional: true,
        },
        create: {
          meetingId: id,
          content: liveTranscript,
          segments: JSON.stringify([]),
          isProvisional: true,
        },
      });

      await prisma.meeting.update({
        where: { id },
        data: { status: "completed", title: titleNow },
      });

      after(async () => {
        try {
          const { text, segments } = await transcribeAudio(buffer, mimeType);
          await prisma.transcript.update({
            where: { meetingId: id },
            data: {
              content: text,
              segments: JSON.stringify(segments),
              isProvisional: false,
            },
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

      return NextResponse.json({
        transcript: transcriptRow,
        title: titleNow,
        provisional: true,
      });
    }

    const { text, segments } = await transcribeAudio(buffer, mimeType);

    let title = meeting.title;
    if ((title === "Naamloze meeting" || title === "Untitled Meeting") && text) {
      title = await generateTitle(text);
    }

    const transcript = await prisma.transcript.upsert({
      where: { meetingId: id },
      update: { content: text, segments: JSON.stringify(segments), isProvisional: false },
      create: {
        meetingId: id,
        content: text,
        segments: JSON.stringify(segments),
        isProvisional: false,
      },
    });

    await prisma.meeting.update({
      where: { id },
      data: { status: "completed", title },
    });

    return NextResponse.json({ transcript, title, provisional: false });
  } catch (err) {
    await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
    console.error("Transcription error:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
