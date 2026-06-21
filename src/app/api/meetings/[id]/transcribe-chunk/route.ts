import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transcribeAudio, generateTitle } from "@/lib/openai";

/**
 * Per-chunk Whisper-transcriptie. Elke chunk is een complete WebM van ~3 minuten
 * (≈ 0,7 MB op 32 kbps), dus past binnen de Vercel body-limit én Whisper's 25 MB limit.
 */
export const maxDuration = 120;

type Segment = { start: number; end: number; text: string };

function parseProcessedIndices(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const meeting = await prisma.meeting.findFirst({
    where: { id },
  });
  if (!meeting) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audioBlob = formData.get("audio") as Blob | null;
  const indexStr = formData.get("index") as string | null;
  const totalStr = formData.get("total") as string | null;
  const offsetStr = formData.get("offsetSeconds") as string | null;
  const totalDurationStr = formData.get("totalDuration") as string | null;
  const isLastStr = formData.get("isLast") as string | null;
  const mimeType = (formData.get("mimeType") as string) || "audio/webm";

  if (!audioBlob || !indexStr || !totalStr) {
    return NextResponse.json(
      { error: "Velden 'audio', 'index' en 'total' zijn verplicht" },
      { status: 400 }
    );
  }

  const index = Number.parseInt(indexStr, 10);
  const total = Number.parseInt(totalStr, 10);
  const offsetSeconds = offsetStr ? Number.parseFloat(offsetStr) : 0;
  const isLastExplicit = isLastStr === "true";
  const isLast = isLastExplicit || (total > 0 && index === total - 1);

  if (Number.isNaN(index) || Number.isNaN(total) || index < 0 || total <= 0) {
    return NextResponse.json({ error: "Ongeldige index/total" }, { status: 400 });
  }

  const t0 = Date.now();
  console.log(`[chunk ${id}#${index + 1}/${total}] start, offset=${offsetSeconds}s, isLast=${isLast}`);

  try {
    const existingTranscript = await prisma.transcript.findUnique({
      where: { meetingId: id },
    });
    const processed = parseProcessedIndices(existingTranscript?.processedChunkIndices);

    if (processed.includes(index)) {
      console.log(`[chunk ${id}#${index + 1}/${total}] al verwerkt — skip (idempotent)`);
      if (isLast) {
        const totalDuration = totalDurationStr ? Number.parseInt(totalDurationStr, 10) : null;
        const updateData: { status: string; endedAt: Date; duration?: number } = {
          status: "completed",
          endedAt: new Date(),
        };
        if (totalDuration && !Number.isNaN(totalDuration)) {
          updateData.duration = totalDuration;
        }
        await prisma.meeting.update({ where: { id }, data: updateData });
      }
      return NextResponse.json({
        ok: true,
        index,
        total,
        isLast,
        skipped: true,
        transcriptLength: existingTranscript?.content?.length ?? 0,
      });
    }

    const buffer = Buffer.from(await audioBlob.arrayBuffer());
    console.log(
      `[chunk ${id}#${index + 1}/${total}] ${Math.round(buffer.length / 1024)} KB ontvangen`
    );

    if (index === 0 && !existingTranscript) {
      await prisma.meeting.update({
        where: { id },
        data: { status: "processing" },
      });
      await prisma.transcript.create({
        data: {
          meetingId: id,
          content: "",
          segments: JSON.stringify([]),
          isProvisional: true,
          processedChunkIndices: "[]",
        },
      });
    } else if (index === 0 && existingTranscript && processed.length === 0) {
      await prisma.meeting.update({
        where: { id },
        data: { status: "processing" },
      });
      await prisma.transcript.update({
        where: { meetingId: id },
        data: { content: "", segments: JSON.stringify([]), isProvisional: true, processedChunkIndices: "[]" },
      });
    }

    const wStart = Date.now();
    const { text, segments } = await transcribeAudio(buffer, mimeType);
    console.log(
      `[chunk ${id}#${index + 1}/${total}] Whisper klaar in ${Date.now() - wStart}ms — ${text.length} chars`
    );

    const adjustedSegments: Segment[] = segments.map((s) => ({
      start: s.start + offsetSeconds,
      end: s.end + offsetSeconds,
      text: s.text,
    }));

    const current = await prisma.transcript.findUnique({
      where: { meetingId: id },
    });

    let existingSegments: Segment[] = [];
    if (current?.segments) {
      try {
        const parsed = JSON.parse(current.segments);
        if (Array.isArray(parsed)) existingSegments = parsed as Segment[];
      } catch {
        /* corrupt JSON — start opnieuw */
      }
    }
    const existingContent = current?.content || "";
    const cleanText = text.trim();

    const newContent = existingContent && cleanText
      ? `${existingContent} ${cleanText}`
      : (cleanText || existingContent);
    const newSegments = [...existingSegments, ...adjustedSegments];
    const newProcessed = [...parseProcessedIndices(current?.processedChunkIndices), index];

    await prisma.transcript.update({
      where: { meetingId: id },
      data: {
        content: newContent,
        segments: JSON.stringify(newSegments),
        isProvisional: !isLast,
        processedChunkIndices: JSON.stringify(newProcessed),
      },
    });

    if (isLast) {
      const totalDuration = totalDurationStr ? Number.parseInt(totalDurationStr, 10) : null;
      const updateData: { status: string; endedAt: Date; title?: string; duration?: number } = {
        status: "completed",
        endedAt: new Date(),
      };
      if (totalDuration && !Number.isNaN(totalDuration)) {
        updateData.duration = totalDuration;
      }

      const m = await prisma.meeting.findUnique({ where: { id } });
      if (
        m &&
        newContent &&
        (m.title === "Naamloze meeting" || m.title === "Untitled Meeting")
      ) {
        try {
          updateData.title = await generateTitle(newContent);
        } catch (err) {
          console.error(`[chunk ${id}] generateTitle faalde:`, err);
        }
      }
      await prisma.meeting.update({ where: { id }, data: updateData });
      console.log(`[chunk ${id}] FINAL na ${Date.now() - t0}ms — totaal ${newContent.length} chars`);
    } else {
      console.log(`[chunk ${id}#${index + 1}/${total}] OK na ${Date.now() - t0}ms`);
    }

    return NextResponse.json({
      ok: true,
      index,
      total,
      isLast,
      transcriptLength: newContent.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[chunk ${id}#${index + 1}/${total}] FAIL na ${Date.now() - t0}ms:`, msg);

    await prisma.transcript.updateMany({
      where: { meetingId: id },
      data: {
        content: `⚠️ Transcriptie mislukt op chunk ${index + 1}/${total}: ${msg}`,
        isProvisional: false,
      },
    });
    await prisma.meeting.updateMany({
      where: { id },
      data: { status: "completed" },
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
