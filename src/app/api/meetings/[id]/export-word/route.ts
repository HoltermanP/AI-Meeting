import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notesToHtml, buildNotesOnlyExportHtml } from "@/lib/notes-format";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const meeting = await prisma.meeting.findFirst({
    where: { id, userId: session.user.id },
    include: { notes: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const safeName = meeting.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 80) || "verslag";

  const notesHtml = notesToHtml(meeting.notes?.content || "");
  const html = buildNotesOnlyExportHtml(notesHtml);

  const HTMLtoDOCX = (await import("html-to-docx")).default;
  const buffer = await HTMLtoDOCX(html, "<p></p>", {
    title: meeting.title,
    creator: "AI Meetings",
    font: "Calibri",
    fontSize: 22,
  });

  return new NextResponse(new Uint8Array(buffer as Buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
}
