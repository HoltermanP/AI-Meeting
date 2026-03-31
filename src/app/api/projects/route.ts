import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { meetings: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Naam verplicht" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      name,
      color: typeof body.color === "string" ? body.color : "#6366f1",
      userId: session.user.id,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
