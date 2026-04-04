import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const participants = await prisma.projectParticipant.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(participants);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Naam verplicht" }, { status: 400 });
  }

  const participant = await prisma.projectParticipant.create({
    data: {
      projectId,
      name,
      email: body.email || undefined,
      role: body.role || undefined,
    },
  });

  return NextResponse.json(participant, { status: 201 });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { participantId, ...updateData } = body;

  const participant = await prisma.projectParticipant.findFirst({
    where: {
      id: participantId,
      projectId: projectId,
    },
  });
  if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const updated = await prisma.projectParticipant.update({
    where: { id: participantId },
    data: updateData,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { participantId } = body;

  const participant = await prisma.projectParticipant.findFirst({
    where: {
      id: participantId,
      projectId: projectId,
    },
  });
  if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  await prisma.projectParticipant.delete({
    where: { id: participantId },
  });

  return NextResponse.json({ success: true });
}
