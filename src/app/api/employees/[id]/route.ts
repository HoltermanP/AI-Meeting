import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { firstName, lastName, email } = await req.json();

  const employee = await prisma.employee.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const updated = await prisma.employee.update({
      where: { id },
      data: {
        ...(firstName?.trim() && { firstName: firstName.trim() }),
        ...(lastName?.trim() && { lastName: lastName.trim() }),
        ...(email?.trim() && { email: email.trim().toLowerCase() }),
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "E-mailadres is al in gebruik" }, { status: 409 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.employee.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
