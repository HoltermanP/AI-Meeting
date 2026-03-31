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
      projectId: meeting.projectId ?? undefined,
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
    where: {
      id: body.itemId,
      OR: [
        { meeting: { userId: session.user.id } },
        { project: { userId: session.user.id } },
      ],
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: {
    title?: string;
    assignee?: string | null;
    completed?: boolean;
    dueDate?: Date | null;
    description?: string | null;
  } = {};
  if (typeof body.title === "string") data.title = body.title;
  if (body.assignee !== undefined) data.assignee = body.assignee?.trim?.() ? body.assignee.trim() : null;
  if (typeof body.completed === "boolean") data.completed = body.completed;
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.description !== undefined) {
    data.description = body.description?.trim?.() ? body.description.trim() : null;
  }

  const updated = await prisma.actionItem.update({
    where: { id: body.itemId },
    data,
  });

  return NextResponse.json(updated);
}
