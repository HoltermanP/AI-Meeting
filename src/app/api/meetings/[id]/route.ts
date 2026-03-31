import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findActionItemsForMeeting } from "@/lib/meeting-action-items";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id, userId: session.user.id },
    include: {
      transcript: true,
      notes: true,
      participants: true,
      chatMessages: { orderBy: { createdAt: "asc" } },
      folder: true,
      project: true,
      template: true,
    },
  });

  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const actionItems = await findActionItemsForMeeting(meeting);
  return NextResponse.json({ ...meeting, actionItems });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let templateId = body.templateId;
  if (templateId !== undefined) {
    if (templateId === null || templateId === "") {
      templateId = null;
    } else {
      const tpl = await prisma.template.findFirst({
        where: {
          id: templateId,
          OR: [{ userId: session.user.id }, { isPublic: true }],
        },
      });
      if (!tpl) templateId = undefined;
    }
  }

  let projectIdUpdate: string | null | undefined;
  if (body.projectId !== undefined) {
    if (body.projectId === null || body.projectId === "") {
      projectIdUpdate = null;
    } else {
      const proj = await prisma.project.findFirst({
        where: { id: body.projectId, userId: session.user.id },
      });
      projectIdUpdate = proj ? body.projectId : undefined;
    }
  }

  const updated = await prisma.meeting.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.platform !== undefined && { platform: body.platform }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.folderId !== undefined && { folderId: body.folderId }),
      ...(projectIdUpdate !== undefined && { projectId: projectIdUpdate }),
      ...(body.startedAt !== undefined && { startedAt: body.startedAt }),
      ...(body.endedAt !== undefined && { endedAt: body.endedAt }),
      ...(body.duration !== undefined && { duration: body.duration }),
      ...(templateId !== undefined && { templateId }),
    },
  });

  if (projectIdUpdate !== undefined) {
    await prisma.actionItem.updateMany({
      where: { meetingId: id },
      data: { projectId: projectIdUpdate },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.actionItem.deleteMany({ where: { meetingId: id, projectId: null } }),
    prisma.actionItem.updateMany({
      where: { meetingId: id, projectId: { not: null } },
      data: { meetingId: null },
    }),
    prisma.meeting.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
