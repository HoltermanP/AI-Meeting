import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chatWithTranscript } from "@/lib/openai";
import { userMessageForLlmFailure } from "@/lib/llm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { message } = await req.json();

    const meeting = await prisma.meeting.findFirst({
      where: { id, userId: session.user.id },
      include: {
        transcript: true,
        notes: true,
        chatMessages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.chatMessage.create({
      data: { meetingId: id, role: "user", content: message },
    });

    const history = meeting.chatMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
    history.push({ role: "user", content: message });

    const reply = await chatWithTranscript(
      meeting.transcript?.content || "",
      meeting.notes?.content || "",
      history
    );

    const savedMessage = await prisma.chatMessage.create({
      data: { meetingId: id, role: "assistant", content: reply },
    });

    return NextResponse.json({ message: savedMessage });
  } catch (e) {
    console.error("[chat]", e);
    return NextResponse.json({ error: userMessageForLlmFailure(e) }, { status: 500 });
  }
}
