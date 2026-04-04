import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio } from "@/lib/openai";

export const maxDuration = 60;

/** Almacenamiento temporal en memoria de chunks de audio por meeting (usar Redis en producción) */
const audioChunkStore: Record<string, Buffer[]> = {};
const transcriptStore: Record<string, string> = {};

/**
 * Recibe chunks de audio durante la grabación y los transcribe en tiempo real.
 * POST - Enviar un chunk de audio (blob) 
 * GET - Obtener la transcripción acumulativa actual
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!meeting)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const formData = await req.formData();
    const audioChunk = formData.get("audio") as Blob;
    const mimeType = (formData.get("mimeType") as string) || "audio/webm";
    const isLast = formData.get("isLast") === "true";

    if (!audioChunk) {
      return NextResponse.json(
        { error: "No audio chunk provided" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await audioChunk.arrayBuffer());

    // Solo mantener chunks en memoria por máximo 10 minutos (seguridad)
    if (!audioChunkStore[id]) {
      audioChunkStore[id] = [];
      setTimeout(() => {
        delete audioChunkStore[id];
        delete transcriptStore[id];
      }, 10 * 60 * 1000);
    }

    audioChunkStore[id].push(buffer);
    const totalBuffer = Buffer.concat(audioChunkStore[id]);

    // Transcribir audio acumulado
    let transcribedText = "";
    try {
      const { text } = await transcribeAudio(totalBuffer, mimeType);
      transcribedText = text;
      transcriptStore[id] = transcribedText;
    } catch (err) {
      console.error("Transcription error:", err);
      // Continuar sin error
    }

    // Si es el último chunk, guardar en la base de datos
    if (isLast) {
      const transcript = await prisma.transcript.upsert({
        where: { meetingId: id },
        update: {
          content: transcribedText,
          segments: JSON.stringify([]),
          isProvisional: false,
        },
        create: {
          meetingId: id,
          content: transcribedText,
          segments: JSON.stringify([]),
          isProvisional: false,
        },
      });

      // Limpiar almacenamiento
      delete audioChunkStore[id];
      delete transcriptStore[id];

      return NextResponse.json({
        transcript: transcript.content,
        segments: [],
        isLast: true,
      });
    }

    return NextResponse.json({
      transcript: transcribedText,
      cumulativeBytes: totalBuffer.length,
    });
  } catch (err) {
    console.error("Stream transcription error:", err);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}

/**
 * GET - Obtener transcripción acumulada actual sin procesar nuevo audio
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!meeting)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentTranscript = transcriptStore[id] || "";
  const chunks = audioChunkStore[id] || [];
  const totalBytes = chunks.reduce((sum, buf) => sum + buf.length, 0);

  return NextResponse.json({
    transcript: currentTranscript,
    cumulativeBytes: totalBytes,
  });
}

