import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: meetingId } = await params;

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, userId: session.user.id },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { employeeId } = await req.json();
  if (!employeeId) return NextResponse.json({ error: "employeeId verplicht" }, { status: 400 });

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, userId: session.user.id },
  });
  if (!employee) return NextResponse.json({ error: "Medewerker niet gevonden" }, { status: 404 });

  // Prevent duplicate
  const existing = await prisma.participant.findFirst({
    where: { meetingId, employeeId },
  });
  if (existing) return NextResponse.json(existing);

  const participant = await prisma.participant.create({
    data: {
      meetingId,
      employeeId,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
    },
  });

  return NextResponse.json(participant, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: meetingId } = await params;
  const { participantId } = await req.json();

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, userId: session.user.id },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.participant.deleteMany({
    where: { id: participantId, meetingId },
  });

  return NextResponse.json({ success: true });
}
