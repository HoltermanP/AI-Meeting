import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1).default("Naamloze meeting"),
  platform: z.string().optional(),
  folderId: z.string().optional(),
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
  const status = searchParams.get("status");

  const meetings = await prisma.meeting.findMany({
    where: {
      userId: session.user.id,
      ...(folderId ? { folderId } : {}),
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search } },
          { notes: { content: { contains: search } } },
          { transcript: { content: { contains: search } } },
        ]
      } : {}),
    },
    include: {
      notes: { select: { summary: true } },
      actionItems: { select: { id: true, completed: true } },
      participants: true,
      folder: true,
      transcript: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(meetings);
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

  const meeting = await prisma.meeting.create({
    data: {
      title: data.title,
      platform: data.platform,
      folderId: data.folderId,
      templateId: templateId ?? undefined,
      userId: session.user.id,
      participants: data.participants ? {
        create: data.participants,
      } : undefined,
    },
    include: {
      participants: true,
      folder: true,
    },
  });

  return NextResponse.json(meeting, { status: 201 });
}
