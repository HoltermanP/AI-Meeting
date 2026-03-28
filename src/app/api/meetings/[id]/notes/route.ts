import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const notes = await prisma.notes.upsert({
    where: { meetingId: id },
    update: { content: body.content, rawNotes: body.rawNotes },
    create: { meetingId: id, content: body.content || "", rawNotes: body.rawNotes },
  });

  return NextResponse.json(notes);
}
