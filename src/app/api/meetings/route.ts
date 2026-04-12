import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { attachActionItemsToMeetings } from "@/lib/meeting-action-items";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).default("Naamloze meeting"),
  platform: z.string().optional(),
  folderId: z.string().optional(),
  projectId: z.string().optional(),
  templateId: z.string().optional(),
  participants: z.array(z.object({
    name: z.string(),
    email: z.string().optional(),
    role: z.string().optional(),
  })).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const folderId = searchParams.get("folderId");
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const minimal = searchParams.get("minimal") === "true";

  const where = {
    userId: session.user.id,
    ...(folderId ? { folderId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search } },
        { notes: { content: { contains: search } } },
        { transcript: { content: { contains: search } } },
      ]
    } : {}),
  };

  if (minimal) {
    const meetings = await prisma.meeting.findMany({
      where,
      select: {
        id: true,
        title: true,
        createdAt: true,
        status: true,
        scheduledAt: true,
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
    return NextResponse.json(meetings);
  }

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      notes: { select: { summary: true } },
      participants: true,
      folder: true,
      project: true,
      transcript: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withActions = await attachActionItemsToMeetings(meetings);
  return NextResponse.json(withActions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const data = createSchema.parse(body);

  let templateId = data.templateId;
  if (templateId) {
    const tpl = await prisma.template.findFirst({
      where: {
        id: templateId,
        OR: [{ userId: session.user.id }, { isPublic: true }],
      },
    });
    if (!tpl) templateId = undefined;
  }

  let projectId = data.projectId;
  if (projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    });
    if (!proj) projectId = undefined;
  }

  const meeting = await prisma.meeting.create({
    data: {
      title: data.title,
      platform: data.platform,
      folderId: data.folderId,
      projectId: projectId ?? undefined,
      templateId: templateId ?? undefined,
      userId: session.user.id,
      participants: data.participants ? {
        create: data.participants,
      } : undefined,
    },
    include: {
      participants: true,
      folder: true,
      project: true,
    },
  });

  return NextResponse.json(meeting, { status: 201 });
}
