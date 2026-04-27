import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: { template: { select: { id: true, name: true } } },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(project);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(typeof body.name === "string" && { name: body.name.trim() }),
      ...(typeof body.color === "string" && { color: body.color }),
      ...(body.templateId !== undefined && { templateId: body.templateId || null }),
      ...(body.plannerPlanId !== undefined && { plannerPlanId: body.plannerPlanId || null }),
      ...(body.plannerBucketId !== undefined && { plannerBucketId: body.plannerBucketId || null }),
      ...(body.sharePointDriveId !== undefined && { sharePointDriveId: body.sharePointDriveId || null }),
      ...(body.sharePointFolderPath !== undefined && { sharePointFolderPath: body.sharePointFolderPath || null }),
      ...(body.teamsWebhookUrl !== undefined && { teamsWebhookUrl: body.teamsWebhookUrl || null }),
    },
    include: { template: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
