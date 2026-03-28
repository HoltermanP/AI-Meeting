import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const folders = await prisma.folder.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { meetings: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(folders);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const folder = await prisma.folder.create({
    data: {
      name: body.name,
      color: body.color || "#6366f1",
      userId: session.user.id,
    },
  });

  return NextResponse.json(folder, { status: 201 });
}
