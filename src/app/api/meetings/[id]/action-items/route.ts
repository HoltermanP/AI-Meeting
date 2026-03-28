import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const item = await prisma.actionItem.create({
    data: {
      meetingId: id,
      title: body.title,
      assignee: body.assignee,
      description: body.description,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const item = await prisma.actionItem.findFirst({
    where: { id: body.itemId, meeting: { userId: session.user.id } },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.actionItem.update({
    where: { id: body.itemId },
    data: {
      title: body.title,
      assignee: body.assignee,
      completed: body.completed,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
  });

  return NextResponse.json(updated);
}
