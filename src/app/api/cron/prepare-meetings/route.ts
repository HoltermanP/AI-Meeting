import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chatCompletion } from "@/lib/llm";
import { sendTeamsNotification, buildAgendaCard } from "@/lib/teams-notify";
import { getConfig } from "@/lib/app-config";
import { updateOutlookEvent, isMsConnected } from "@/lib/microsoft-graph";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = (await getConfig("cron_secret")) ?? process.env.CRON_SECRET ?? "";

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Meetings die komende 24 uur gepland staan en nog geen agenda hebben
  const upcoming = await prisma.meeting.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { gte: now, lte: in24h },
      agenda: null,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          teamsWebhookUrl: true,
          template: {
            select: { goal: true, defaultAgenda: true, aiContextInstructions: true },
          },
        },
        include: {
          actionItems: {
            where: { completed: false },
            select: { title: true, assignee: true, dueDate: true },
            orderBy: { createdAt: "asc" },
            take: 20,
          },
        },
      },
      notes: { select: { summary: true, content: true } },
    },
  });

  const results: { meetingId: string; agendaGenerated: boolean; notified: boolean }[] = [];

  for (const meeting of upcoming) {
    try {
      const project = meeting.project;
      const openItems = project?.actionItems ?? [];
      const lastSummary = meeting.notes?.summary ?? "";

      const defaultAgendaHint = project?.template?.defaultAgenda
        ? `\nStandaard agendastructuur voor dit overlegtype:\n${project.template.defaultAgenda}`
        : "";

      const contextHint = project?.template?.aiContextInstructions
        ? `\nOverlegtype context:\n${project.template.aiContextInstructions}`
        : "";

      const actielijst =
        openItems.length > 0
          ? openItems
              .map(
                (a, i) =>
                  `${i + 1}. ${a.title}${a.assignee ? ` (${a.assignee})` : ""}${a.dueDate ? ` – voor ${new Date(a.dueDate).toLocaleDateString("nl-NL")}` : ""}`
              )
              .join("\n")
          : "Geen openstaande actiepunten.";

      const raw = await chatCompletion(
        "chat",
        "Je bent een ervaren vergaderfacilitator. Schrijf alles in het Nederlands. Geef alleen de JSON-array terug, geen extra tekst.",
        `Vergadering: "${meeting.title}"
Project: "${project?.name ?? ""}"
${contextHint}${defaultAgendaHint}

Samenvatting vorige vergadering:
${lastSummary || "Geen vorig verslag."}

Openstaande actiepunten:
${actielijst}

Maak een agenda. JSON-array, elk item: { "id": string, "title": string, "notes": string, "duration": number }.`,
        1000
      );

      let items: { id: string; title: string; notes: string; duration: number }[] = [];
      try {
        items = JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim());
      } catch {
        items = [];
      }

      if (items.length > 0) {
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { agenda: JSON.stringify(items) },
        });

        // Push agenda naar Outlook-event als dat gekoppeld is
        if (meeting.outlookEventId && meeting.scheduledAt) {
          const msOk = await isMsConnected(meeting.userId).catch(() => false);
          if (msOk) {
            await updateOutlookEvent(meeting.userId, meeting.outlookEventId, {
              title: meeting.title,
              scheduledAt: meeting.scheduledAt,
              agenda: JSON.stringify(items),
              platform: meeting.platform ?? null,
            }).catch((e) => console.error("[cron/prepare-meetings] Outlook agenda-sync fout:", e));
          }
        }
      }

      let notified = false;
      if (project?.teamsWebhookUrl && items.length > 0 && meeting.scheduledAt) {
        const card = buildAgendaCard(
          appUrl,
          meeting.title,
          meeting.id,
          meeting.scheduledAt,
          items
        );
        notified = await sendTeamsNotification(project.teamsWebhookUrl, card);
      }

      results.push({ meetingId: meeting.id, agendaGenerated: items.length > 0, notified });
    } catch (e) {
      console.error("[cron/prepare-meetings] fout voor meeting", meeting.id, e);
      results.push({ meetingId: meeting.id, agendaGenerated: false, notified: false });
    }
  }

  return NextResponse.json({ processed: upcoming.length, results });
}
