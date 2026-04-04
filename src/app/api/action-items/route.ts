import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const onlyOpen = searchParams.get("completed") !== "true";

  const items = await prisma.actionItem.findMany({
    where: {
      ...(onlyOpen && { completed: false }),
      OR: [
        { meeting: { userId: session.user.id } },
        { project: { userId: session.user.id } },
      ],
    },
    include: {
      meeting: { select: { id: true, title: true } },
      project: { select: { id: true, name: true, color: true } },
    },
    orderBy: [
      { dueDate: "asc" },
      { createdAt: "asc" },
    ],
  });

  return NextResponse.json(items);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await req.json();

  const item = await prisma.actionItem.findFirst({
    where: {
      id: itemId,
      OR: [
        { meeting: { userId: session.user.id } },
        { project: { userId: session.user.id } },
      ],
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.actionItem.delete({ where: { id: itemId } });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId, ...patch } = await req.json();

  const item = await prisma.actionItem.findFirst({
    where: {
      id: itemId,
      OR: [
        { meeting: { userId: session.user.id } },
        { project: { userId: session.user.id } },
      ],
    },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof patch.completed === "boolean") data.completed = patch.completed;
  if (typeof patch.assignee !== "undefined") data.assignee = patch.assignee || null;
  if (typeof patch.dueDate !== "undefined") data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;

  const updated = await prisma.actionItem.update({ where: { id: itemId }, data });
  return NextResponse.json(updated);
}
