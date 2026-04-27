import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeTemplateDocx } from "@/lib/uploads";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.template.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.template.update({
    where: { id },
    data: {
      ...(body.name != null && { name: String(body.name) }),
      ...(body.description !== undefined && { description: body.description ?? null }),
      ...(body.content != null && { content: String(body.content) }),
      ...(body.actionItemsInstructions !== undefined && {
        actionItemsInstructions: body.actionItemsInstructions || null,
      }),
      ...(body.goal !== undefined && { goal: body.goal || null }),
      ...(body.defaultAgenda !== undefined && { defaultAgenda: body.defaultAgenda || null }),
      ...(body.aiContextInstructions !== undefined && {
        aiContextInstructions: body.aiContextInstructions || null,
      }),
      ...(body.outputFocus !== undefined && { outputFocus: body.outputFocus || null }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.template.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.meeting.updateMany({
    where: { templateId: id },
    data: { templateId: null },
  });
  await removeTemplateDocx(existing.docxPath);
  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
