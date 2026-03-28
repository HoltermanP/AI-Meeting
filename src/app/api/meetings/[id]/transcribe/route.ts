import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio, generateTitle } from "@/lib/openai";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Update status to processing
  await prisma.meeting.update({ where: { id }, data: { status: "processing" } });

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as Blob;
    const mimeType = formData.get("mimeType") as string || "audio/webm";

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const { text, segments } = await transcribeAudio(buffer, mimeType);

    // Auto-generate title if still default
    let title = meeting.title;
    if ((title === "Naamloze meeting" || title === "Untitled Meeting") && text) {
      title = await generateTitle(text);
    }

    // Upsert transcript
    const transcript = await prisma.transcript.upsert({
      where: { meetingId: id },
      update: { content: text, segments: JSON.stringify(segments) },
      create: { meetingId: id, content: text, segments: JSON.stringify(segments) },
    });

    await prisma.meeting.update({
      where: { id },
      data: { status: "completed", title },
    });

    return NextResponse.json({ transcript, title });
  } catch (err) {
    await prisma.meeting.update({ where: { id }, data: { status: "draft" } });
    console.error("Transcription error:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
