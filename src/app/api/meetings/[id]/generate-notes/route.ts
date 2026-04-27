import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMeetingNotes } from "@/lib/openai";
import { findActionItemsForMeeting } from "@/lib/meeting-action-items";
import { userMessageForLlmFailure } from "@/lib/llm";
import { createPlannerTask } from "@/lib/planner";
import { uploadToSharePoint } from "@/lib/sharepoint";

const encoder = new TextEncoder();

function sse(obj: object): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const meeting = await prisma.meeting.findFirst({
      where: { id, userId: session.user.id },
      include: {
        transcript: true,
        notes: true,
        template: true,
        participants: true,
        project: {
          select: {
            id: true,
            plannerPlanId: true,
            plannerBucketId: true,
            sharePointDriveId: true,
            sharePointFolderPath: true,
            teamsWebhookUrl: true,
            template: {
              select: { aiContextInstructions: true, outputFocus: true },
            },
          },
        },
      },
    });

    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!meeting.transcript)
      return NextResponse.json({ error: "No transcript available" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const rawNotes = body.rawNotes || meeting.notes?.rawNotes || "";

    const reportStructure = meeting.template?.content?.trim() || "";
    const templatePayload = meeting.template
      ? {
          reportStructure: reportStructure || meeting.template.content,
          actionItemsInstructions: meeting.template.actionItemsInstructions,
        }
      : null;

    const participants = meeting.participants.map((p) => ({
      name: p.name,
      email: p.email,
    }));

    // Meeting type context: eigen template voor de meeting eerst, daarna project-template
    const meetingTypeContext =
      meeting.template?.aiContextInstructions ??
      meeting.project?.template?.aiContextInstructions ??
      null;

    const outputFocus =
      meeting.template?.outputFocus ??
      meeting.project?.template?.outputFocus ??
      null;

    const transcriptContent = meeting.transcript.content;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (chunk: Uint8Array) => controller.enqueue(chunk);
        try {
          const { notes, summary, actionItems: aiActionItems } = await generateMeetingNotes(
            transcriptContent,
            templatePayload,
            rawNotes,
            { participants, meetingTypeContext, outputFocus },
            {
              onStreamDelta: (text) => {
                send(sse({ type: "delta", text }));
              },
            }
          );

          await prisma.notes.upsert({
            where: { meetingId: id },
            update: { content: notes, summary, rawNotes },
            create: { meetingId: id, content: notes, summary, rawNotes },
          });

          await prisma.actionItem.deleteMany({ where: { meetingId: id } });

          if (aiActionItems.length > 0) {
            const created = await prisma.$transaction(
              aiActionItems.map((item) =>
                prisma.actionItem.create({
                  data: {
                    meetingId: id,
                    projectId: meeting.projectId ?? undefined,
                    title: item.title,
                    assignee: item.assignee,
                    description: item.description,
                  },
                })
              )
            );

            // Planner-taken aanmaken als project gekoppeld is
            const project = meeting.project;
            if (project?.plannerPlanId && project.plannerBucketId) {
              await Promise.all(
                created.map(async (dbItem, i) => {
                  const taskId = await createPlannerTask(
                    session.user.id,
                    project.plannerPlanId!,
                    project.plannerBucketId!,
                    {
                      title: dbItem.title,
                      description: dbItem.description,
                      dueDate: dbItem.dueDate,
                    }
                  );
                  if (taskId) {
                    await prisma.actionItem.update({
                      where: { id: dbItem.id },
                      data: { plannerTaskId: taskId },
                    });
                  }
                })
              );
            }
          }

          // SharePoint-upload als project geconfigureerd is
          const project = meeting.project;
          if (project?.sharePointDriveId && notes) {
            const folder = project.sharePointFolderPath || "Notulen";
            const dateStr = new Date().toISOString().slice(0, 10);
            const fileName = `${meeting.title.replace(/[/\\:*?"<>|]/g, "_")}_${dateStr}.txt`;
            await uploadToSharePoint(
              session.user.id,
              project.sharePointDriveId,
              folder,
              fileName,
              Buffer.from(notes, "utf-8"),
              "text/plain"
            ).catch((e) => console.error("[generate-notes] SharePoint upload fout:", e));
          }

          const updatedMeeting = await prisma.meeting.findUnique({
            where: { id },
            include: { notes: true, template: true },
          });
          if (!updatedMeeting) {
            send(sse({ type: "error", error: "Not found" }));
            return;
          }

          const actionItems = await findActionItemsForMeeting(updatedMeeting);
          send(sse({ type: "done", meeting: { ...updatedMeeting, actionItems } }));
        } catch (e) {
          console.error("[generate-notes]", e);
          send(sse({ type: "error", error: userMessageForLlmFailure(e) }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("[generate-notes]", e);
    return NextResponse.json({ error: userMessageForLlmFailure(e) }, { status: 500 });
  }
}
