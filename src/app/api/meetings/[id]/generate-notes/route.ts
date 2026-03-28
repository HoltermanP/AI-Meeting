import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMeetingNotes } from "@/lib/openai";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id, userId: session.user.id },
    include: { transcript: true, notes: true, template: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!meeting.transcript) return NextResponse.json({ error: "No transcript available" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const rawNotes = body.rawNotes || meeting.notes?.rawNotes || "";

  const reportStructure = meeting.template?.content?.trim() || "";
  const templatePayload = meeting.template
    ? {
        reportStructure: reportStructure || meeting.template.content,
        actionItemsInstructions: meeting.template.actionItemsInstructions,
      }
    : null;

  const { notes, summary, actionItems: aiActionItems } = await generateMeetingNotes(
    meeting.transcript.content,
    templatePayload,
    rawNotes
  );

  const savedNotes = await prisma.notes.upsert({
    where: { meetingId: id },
    update: {
      content: notes,
      summary,
      rawNotes,
    },
    create: {
      meetingId: id,
      content: notes,
      summary,
      rawNotes,
    },
  });

  // Actielijst: altijd vervangen bij regenereren (ook leeg als AI geen acties vond)
  await prisma.actionItem.deleteMany({ where: { meetingId: id } });
  if (aiActionItems.length > 0) {
    await prisma.actionItem.createMany({
      data: aiActionItems.map((item) => ({
        meetingId: id,
        title: item.title,
        assignee: item.assignee,
        description: item.description,
      })),
    });
  }

  const updatedMeeting = await prisma.meeting.findUnique({
    where: { id },
    include: { notes: true, actionItems: true, template: true },
  });

  return NextResponse.json(updatedMeeting);
}
